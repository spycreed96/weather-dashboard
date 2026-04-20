from datetime import datetime, timedelta
from math import acos, pi
from urllib.parse import quote

import httpx

from core.config import MAX_FORECAST_DAYS, WEATHER_API_BASE_URL, WEATHER_API_KEY, WEATHER_API_LANGUAGE
from modules.weather.forecast_builders import build_forecast_day, build_hourly_forecast_points
from modules.weather.schemas import ForecastDay

AQI_LABELS = {
    1: "Buona",
    2: "Accettabile",
    3: "Moderata",
    4: "Cattiva",
    5: "Molto cattiva",
    6: "Molto cattiva",
}

AQI_FALLBACK_INDEX = {
    1: 25,
    2: 75,
    3: 125,
    4: 175,
    5: 250,
    6: 300,
}

MOON_PHASE_LABELS = {
    "New Moon": "Luna nuova",
    "Waxing Crescent": "Falce crescente",
    "First Quarter": "Primo quarto",
    "Waxing Gibbous": "Gibbosa crescente",
    "Full Moon": "Luna piena",
    "Waning Gibbous": "Gibbosa calante",
    "Last Quarter": "Ultimo quarto",
    "Waning Crescent": "Falce calante",
}

DEFAULT_LOCATION_COUNTRY = "Italy"
SYNODIC_MONTH_DAYS = 29.530588853

PM25_BREAKPOINTS = (
    (0.0, 12.0, 0, 50),
    (12.1, 35.4, 51, 100),
    (35.5, 55.4, 101, 150),
    (55.5, 150.4, 151, 200),
    (150.5, 250.4, 201, 300),
    (250.5, 350.4, 301, 400),
    (350.5, 500.4, 401, 500),
)

PM10_BREAKPOINTS = (
    (0.0, 54.0, 0, 50),
    (55.0, 154.0, 51, 100),
    (155.0, 254.0, 101, 150),
    (255.0, 354.0, 151, 200),
    (355.0, 424.0, 201, 300),
    (425.0, 504.0, 301, 400),
    (505.0, 604.0, 401, 500),
)

O3_BREAKPOINTS = (
    (0.000, 0.054, 0, 50),
    (0.055, 0.070, 51, 100),
    (0.071, 0.085, 101, 150),
    (0.086, 0.105, 151, 200),
    (0.106, 0.200, 201, 300),
)


def interpolate_air_quality_index(concentration: float, breakpoints: tuple[tuple[float, float, int, int], ...]) -> float | None:
    for concentration_low, concentration_high, index_low, index_high in breakpoints:
        if concentration_low <= concentration <= concentration_high:
            return ((index_high - index_low) / (concentration_high - concentration_low)) * (
                concentration - concentration_low
            ) + index_low

    if concentration > breakpoints[-1][1]:
        return float(breakpoints[-1][3])

    return None


def micrograms_per_cubic_meter_to_ppb(value: float, molecular_weight: float) -> float:
    return (float(value) * 24.45) / molecular_weight


def ensure_weather_api_configured() -> None:
    if not WEATHER_API_KEY:
        raise RuntimeError("Configura WEATHER_API_KEY nel file .env per usare WeatherAPI come sorgente principale.")


def has_explicit_location_context(query: str) -> bool:
    return "," in query


def build_country_biased_query(query: str, country_name: str = DEFAULT_LOCATION_COUNTRY) -> str:
    return f"{query}, {country_name}"


def normalize_weatherapi_icon(icon: str | None) -> str:
    if not icon:
        return ""

    if icon.startswith("//"):
        return f"https:{icon}"

    return icon


def build_air_quality_metrics(entry: dict | None) -> dict:
    if not entry:
        return {
            "air_quality": "N/A",
            "air_quality_index": None,
            "air_quality_primary_pollutant": None,
            "air_quality_primary_pollutant_value": None,
            "air_quality_primary_pollutant_unit": None,
        }

    bucket = entry.get("us-epa-index") or entry.get("us_epa_index") or entry.get("main", {}).get("aqi")
    components = entry.get("components", {}) if "components" in entry else entry
    pollutant_scores: list[dict] = []

    pm25 = components.get("pm2_5")
    if pm25 is not None:
        pm25_index = interpolate_air_quality_index(float(pm25), PM25_BREAKPOINTS)
        if pm25_index is not None:
            pollutant_scores.append(
                {
                    "aqi": pm25_index,
                    "label": "PM2.5",
                    "value": round(float(pm25), 1),
                    "unit": "ug/m3",
                }
            )

    pm10 = components.get("pm10")
    if pm10 is not None:
        pm10_index = interpolate_air_quality_index(float(pm10), PM10_BREAKPOINTS)
        if pm10_index is not None:
            pollutant_scores.append(
                {
                    "aqi": pm10_index,
                    "label": "PM10",
                    "value": round(float(pm10), 1),
                    "unit": "ug/m3",
                }
            )

    ozone_micrograms = components.get("o3")
    if ozone_micrograms is not None:
        ozone_ppb = micrograms_per_cubic_meter_to_ppb(float(ozone_micrograms), 48.0)
        ozone_index = interpolate_air_quality_index(ozone_ppb / 1000, O3_BREAKPOINTS)
        if ozone_index is not None:
            pollutant_scores.append(
                {
                    "aqi": ozone_index,
                    "label": "O3",
                    "value": round(ozone_ppb, 1),
                    "unit": "ppb",
                }
            )

    primary_pollutant = max(pollutant_scores, key=lambda item: item["aqi"], default=None)
    air_quality_index = round(primary_pollutant["aqi"]) if primary_pollutant else AQI_FALLBACK_INDEX.get(bucket)

    return {
        "air_quality": AQI_LABELS.get(bucket, "N/A"),
        "air_quality_index": air_quality_index,
        "air_quality_primary_pollutant": primary_pollutant["label"] if primary_pollutant else None,
        "air_quality_primary_pollutant_value": primary_pollutant["value"] if primary_pollutant else None,
        "air_quality_primary_pollutant_unit": primary_pollutant["unit"] if primary_pollutant else None,
    }


def parse_weatherapi_datetime(value: str | None) -> datetime | None:
    if not value:
        return None

    try:
        return datetime.strptime(value, "%Y-%m-%d %H:%M")
    except ValueError:
        return None


def parse_weatherapi_date(value: str | None):
    if not value:
        return None

    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None


def parse_weatherapi_clock_time(target_date, value: str | None) -> datetime | None:
    if not value or value.lower().startswith("no "):
        return None

    try:
        parsed_time = datetime.strptime(value, "%I:%M %p")
    except ValueError:
        return None

    return datetime.combine(target_date, parsed_time.time())


def format_time_24h(value: datetime | None) -> str | None:
    if value is None:
        return None

    return value.strftime("%H:%M")


def calculate_span_minutes(start_time: datetime | None, end_time: datetime | None) -> int | None:
    if start_time is None or end_time is None:
        return None

    adjusted_end_time = end_time
    if adjusted_end_time <= start_time:
        adjusted_end_time += timedelta(days=1)

    return max(round((adjusted_end_time - start_time).total_seconds() / 60), 0)


def calculate_cycle_progress(current_time: datetime, start_time: datetime | None, end_time: datetime | None) -> float | None:
    if start_time is None or end_time is None:
        return None

    adjusted_end_time = end_time

    if adjusted_end_time <= start_time:
        adjusted_end_time += timedelta(days=1)

    if adjusted_end_time == start_time:
        return None

    return (current_time - start_time) / (adjusted_end_time - start_time)


def get_moon_cycle_position(moon_phase: str | None, moon_illumination: int | float | None) -> float | None:
    if moon_phase is None or moon_illumination is None:
        return None

    illumination_fraction = max(0.0, min(1.0, float(moon_illumination) / 100))
    phase_angle = acos(max(-1.0, min(1.0, 1 - 2 * illumination_fraction)))
    normalized_position = phase_angle / (2 * pi)

    return {
        "New Moon": 0.0,
        "Waxing Crescent": normalized_position,
        "First Quarter": 0.25,
        "Waxing Gibbous": normalized_position,
        "Full Moon": 0.5,
        "Waning Gibbous": 1 - normalized_position,
        "Last Quarter": 0.75,
        "Waning Crescent": 1 - normalized_position,
    }.get(moon_phase)


def calculate_next_full_moon_date(target_date, moon_phase: str | None, moon_illumination: int | float | None) -> str | None:
    cycle_position = get_moon_cycle_position(moon_phase, moon_illumination)

    if cycle_position is None or target_date is None:
        return None

    days_until_full_moon = ((0.5 - cycle_position) % 1) * SYNODIC_MONTH_DAYS
    next_full_moon_dt = datetime.combine(target_date, datetime.min.time()) + timedelta(days=days_until_full_moon)

    return next_full_moon_dt.date().isoformat()


def get_moon_phase_label(moon_phase: str | None) -> str | None:
    if not moon_phase:
        return None

    return MOON_PHASE_LABELS.get(moon_phase, moon_phase)


def build_astronomy_context(astro_payload: dict | None, target_date, current_local_dt: datetime) -> dict:
    if not astro_payload or target_date is None:
        return {
            "sunrise_time": None,
            "sunset_time": None,
            "sun_visibility_minutes": None,
            "sun_progress": None,
            "moonrise_time": None,
            "moonset_time": None,
            "moon_visibility_minutes": None,
            "moon_phase_label": None,
            "moon_illumination": None,
            "next_full_moon_date": None,
            "moon_progress": None,
        }

    sunrise_time = parse_weatherapi_clock_time(target_date, astro_payload.get("sunrise"))
    sunset_time = parse_weatherapi_clock_time(target_date, astro_payload.get("sunset"))
    if sunrise_time and sunset_time and sunset_time <= sunrise_time:
        sunset_time += timedelta(days=1)

    moonrise_time = parse_weatherapi_clock_time(target_date, astro_payload.get("moonrise"))
    moonset_time = parse_weatherapi_clock_time(target_date, astro_payload.get("moonset"))
    if moonrise_time and moonset_time and moonset_time <= moonrise_time:
        moonset_time += timedelta(days=1)

    moon_phase = astro_payload.get("moon_phase")
    moon_illumination = astro_payload.get("moon_illumination")

    return {
        "sunrise_time": format_time_24h(sunrise_time),
        "sunset_time": format_time_24h(sunset_time),
        "sun_visibility_minutes": calculate_span_minutes(sunrise_time, sunset_time),
        "sun_progress": calculate_cycle_progress(current_local_dt, sunrise_time, sunset_time),
        "moonrise_time": format_time_24h(moonrise_time),
        "moonset_time": format_time_24h(moonset_time),
        "moon_visibility_minutes": calculate_span_minutes(moonrise_time, moonset_time),
        "moon_phase_label": get_moon_phase_label(moon_phase),
        "moon_illumination": round(float(moon_illumination)) if moon_illumination is not None else None,
        "next_full_moon_date": calculate_next_full_moon_date(target_date, moon_phase, moon_illumination),
        "moon_progress": calculate_cycle_progress(current_local_dt, moonrise_time, moonset_time),
    }


def should_retry_without_optional_features(response: httpx.Response) -> bool:
    try:
        payload = response.json()
    except ValueError:
        return False

    return payload.get("error", {}).get("code") == 2009


async def fetch_weatherapi_forecast_raw(client: httpx.AsyncClient, query: str) -> dict:
    ensure_weather_api_configured()

    base_params = {
        "key": WEATHER_API_KEY,
        "q": query,
        "alerts": "no",
        "lang": WEATHER_API_LANGUAGE,
    }
    days_variants = tuple(dict.fromkeys((MAX_FORECAST_DAYS, min(MAX_FORECAST_DAYS, 3), 1)))
    optional_variants = (
        {"aqi": "yes", "pollen": "yes"},
        {"aqi": "yes"},
        {"pollen": "yes"},
        {},
    )
    last_error: httpx.HTTPStatusError | None = None

    for days in days_variants:
        for optional_params in optional_variants:
            response = await client.get(
                f"{WEATHER_API_BASE_URL}/forecast.json",
                params={**base_params, "days": days, **optional_params},
                timeout=15.0,
            )
            try:
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as exc:
                if should_retry_without_optional_features(exc.response):
                    last_error = exc
                    continue

                raise

    if last_error is not None:
        raise last_error

    raise RuntimeError("Impossibile recuperare il forecast da WeatherAPI.")


async def fetch_weatherapi_forecast(client: httpx.AsyncClient, query: str) -> dict:
    forecast_payload = await fetch_weatherapi_forecast_raw(client, query)

    if has_explicit_location_context(query):
        return forecast_payload

    if forecast_payload.get("location", {}).get("country") == DEFAULT_LOCATION_COUNTRY:
        return forecast_payload

    try:
        italy_biased_payload = await fetch_weatherapi_forecast_raw(client, build_country_biased_query(query))
    except Exception:
        return forecast_payload

    if italy_biased_payload.get("location", {}).get("country") == DEFAULT_LOCATION_COUNTRY:
        return italy_biased_payload

    return forecast_payload


async def fetch_weatherapi_search_results(client: httpx.AsyncClient, query: str) -> list[dict]:
    response = await client.get(
        f"{WEATHER_API_BASE_URL}/search.json",
        params={
            "key": WEATHER_API_KEY,
            "q": query,
        },
        timeout=15.0,
    )
    response.raise_for_status()
    payload = response.json()
    return payload if isinstance(payload, list) else []


async def get_weatherapi_city_suggestions(client: httpx.AsyncClient, query: str, limit: int = 5) -> list[dict]:
    primary_results = await fetch_weatherapi_search_results(client, query)
    italy_biased_results: list[dict] = []

    if not has_explicit_location_context(query):
        try:
            italy_biased_results = await fetch_weatherapi_search_results(client, build_country_biased_query(query))
        except Exception:
            italy_biased_results = []

    suggestions: list[dict] = []
    seen_full_names: set[str] = set()
    for item in [*italy_biased_results, *primary_results]:
        name = item.get("name", "")
        state = item.get("region", "")
        country_name = item.get("country", "")
        lat = item.get("lat")
        lon = item.get("lon")
        full_name = f"{lat},{lon}" if lat is not None and lon is not None else ", ".join(
            part for part in (name, state, country_name) if part
        )
        if not name or full_name in seen_full_names:
            continue

        seen_full_names.add(full_name)
        suggestions.append(
            {
                "name": name,
                "region_country": f"{state}, {country_name}" if state else country_name,
                "full_name": full_name,
            }
        )

        if len(suggestions) >= limit:
            break

    return suggestions


def build_hour_entry_from_weatherapi(hour_payload: dict) -> dict | None:
    local_time = parse_weatherapi_datetime(hour_payload.get("time"))
    if local_time is None:
        return None

    condition = hour_payload.get("condition", {})
    return {
        "timestamp": hour_payload.get("time_epoch") or int(local_time.timestamp()),
        "sort_key": local_time.hour + (local_time.minute / 60),
        "hour": local_time.hour,
        "time_label": local_time.strftime("%H:%M"),
        "temperature": round(hour_payload.get("temp_c", 0)),
        "icon": normalize_weatherapi_icon(condition.get("icon")),
        "description": condition.get("text", ""),
        "pressure": round(hour_payload.get("pressure_mb")) if hour_payload.get("pressure_mb") is not None else None,
    }


def build_display_hour_entries(hourly_payloads: list[dict]) -> list[dict]:
    # Return full hourly entries so frontend can render tooltips for every hour
    all_entries = [entry for item in hourly_payloads if (entry := build_hour_entry_from_weatherapi(item)) is not None]
    return all_entries


def build_current_hour_entry(current_payload: dict, current_local_dt: datetime) -> dict:
    condition = current_payload.get("condition", {})
    return {
        "timestamp": current_payload.get("last_updated_epoch") or int(current_local_dt.timestamp()),
        "sort_key": current_local_dt.hour + (current_local_dt.minute / 60),
        "hour": current_local_dt.hour,
        "time_label": current_local_dt.strftime("%H:%M"),
        "temperature": round(current_payload.get("temp_c", 0)),
        "icon": normalize_weatherapi_icon(condition.get("icon")),
        "description": condition.get("text", ""),
        "is_now": True,
    }


def get_closest_hour_entry(hourly_payloads: list[dict], reference_dt: datetime) -> dict | None:
    candidates = []
    for item in hourly_payloads:
        local_time = parse_weatherapi_datetime(item.get("time"))
        if local_time is None:
            continue

        candidates.append((local_time, item))

    if not candidates:
        return None

    _, closest_payload = min(candidates, key=lambda candidate: abs((candidate[0] - reference_dt).total_seconds()))
    return closest_payload


def calculate_precipitation_next_24h(forecast_days_payload: list[dict], current_epoch: int) -> float:
    next_24h_limit = current_epoch + 86400
    total_precipitation = 0.0

    for forecast_day in forecast_days_payload:
        for hour_payload in forecast_day.get("hour", []):
            hour_epoch = hour_payload.get("time_epoch")
            if not hour_epoch or hour_epoch <= current_epoch or hour_epoch > next_24h_limit:
                continue

            total_precipitation += float(hour_payload.get("precip_mm") or 0.0)

    return round(total_precipitation, 1)


def get_reference_pressure(hourly_payloads: list[dict], reference_dt: datetime) -> int | None:
    closest_hour = get_closest_hour_entry(hourly_payloads, reference_dt)
    pressure = closest_hour.get("pressure_mb") if closest_hour else None
    return round(pressure) if pressure is not None else None


async def get_yesterday_forecast_day(
    client: httpx.AsyncClient,
    query: str,
    current_local_dt: datetime,
) -> ForecastDay | None:
    yesterday_date = current_local_dt.date() - timedelta(days=1)

    try:
        response = await client.get(
            f"{WEATHER_API_BASE_URL}/history.json",
            params={
                "key": WEATHER_API_KEY,
                "q": query,
                "dt": yesterday_date.isoformat(),
                "lang": WEATHER_API_LANGUAGE,
            },
            timeout=15.0,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception:
        return None

    forecast_day = (payload.get("forecast", {}).get("forecastday") or [None])[0]
    if not forecast_day:
        return None

    hourly_payloads = forecast_day.get("hour", [])
    display_entries = build_display_hour_entries(hourly_payloads)
    if not display_entries:
        return None

    reference_dt = datetime.combine(yesterday_date, current_local_dt.time())
    closest_hour = get_closest_hour_entry(hourly_payloads, reference_dt)
    day_payload = forecast_day.get("day", {})
    condition = day_payload.get("condition", {})
    icon = normalize_weatherapi_icon(condition.get("icon"))
    description = condition.get("text", "")

    if closest_hour:
        closest_condition = closest_hour.get("condition", {})
        icon = normalize_weatherapi_icon(closest_condition.get("icon")) or icon
        description = closest_condition.get("text", "") or description

    max_temperature = round(day_payload.get("maxtemp_c", 0))
    current_temperature = round(
        closest_hour.get("temp_c", day_payload.get("avgtemp_c", day_payload.get("maxtemp_c", 0)))
        if closest_hour
        else day_payload.get("avgtemp_c", day_payload.get("maxtemp_c", 0))
    )

    return build_forecast_day(
        yesterday_date,
        current_local_dt.date(),
        max_temperature,
        current_temperature,
        icon,
        description,
        build_hourly_forecast_points(display_entries),
    )


def build_forecast_days(
    forecast_day_payloads: list[dict],
    current_payload: dict,
    current_local_dt: datetime,
    current_epoch: int,
) -> tuple[list[ForecastDay], float | None, float, int | None, dict]:
    current_temperature = round(current_payload.get("temp_c", 0))
    current_icon = normalize_weatherapi_icon(current_payload.get("condition", {}).get("icon"))
    current_description = current_payload.get("condition", {}).get("text", "")
    precipitation_next_24h = calculate_precipitation_next_24h(forecast_day_payloads, current_epoch)
    dew_point = current_payload.get("dewpoint_c")
    if dew_point is not None:
        dew_point = round(dew_point)

    today_payload = forecast_day_payloads[0] if forecast_day_payloads else {}
    astronomy_context = build_astronomy_context(today_payload.get("astro"), current_local_dt.date(), current_local_dt)

    tomorrow_payload = forecast_day_payloads[1] if len(forecast_day_payloads) > 1 else None
    tomorrow_reference_dt = datetime.combine(
        tomorrow_payload and parse_weatherapi_date(tomorrow_payload.get("date")) or current_local_dt.date(),
        current_local_dt.time(),
    )
    pressure_tomorrow = (
        get_reference_pressure(tomorrow_payload.get("hour", []), tomorrow_reference_dt) if tomorrow_payload else None
    )

    forecast_days: list[ForecastDay] = []
    for forecast_day in forecast_day_payloads:
        target_date = parse_weatherapi_date(forecast_day.get("date"))
        if target_date is None:
            continue

        hourly_payloads = forecast_day.get("hour", [])
        day_payload = forecast_day.get("day", {})
        reference_dt = datetime.combine(target_date, current_local_dt.time())
        closest_hour = get_closest_hour_entry(hourly_payloads, reference_dt)

        day_condition = day_payload.get("condition", {})
        icon = normalize_weatherapi_icon(day_condition.get("icon"))
        description = day_condition.get("text", "")
        current_like_temperature = day_payload.get("avgtemp_c", day_payload.get("maxtemp_c", 0))

        if closest_hour:
            hour_condition = closest_hour.get("condition", {})
            icon = normalize_weatherapi_icon(hour_condition.get("icon")) or icon
            description = hour_condition.get("text", "") or description
            current_like_temperature = closest_hour.get("temp_c", current_like_temperature)

        display_entries = build_display_hour_entries(hourly_payloads)
        if target_date == current_local_dt.date():
            display_entries.append(build_current_hour_entry(current_payload, current_local_dt))
            current_like_temperature = current_temperature
            icon = current_icon
            description = current_description

        forecast_days.append(
            build_forecast_day(
                target_date,
                current_local_dt.date(),
                day_payload.get("maxtemp_c", current_like_temperature),
                current_like_temperature,
                icon,
                description,
                build_hourly_forecast_points(display_entries),
            )
        )

    return forecast_days[:MAX_FORECAST_DAYS], dew_point, precipitation_next_24h, pressure_tomorrow, astronomy_context


async def get_country_metadata(client: httpx.AsyncClient, country_name: str) -> tuple[str, str, str]:
    country_code = country_name
    continent = ""

    if not country_name:
        return country_code, country_name, continent

    endpoints = (
        f"https://restcountries.com/v3.1/name/{quote(country_name)}?fullText=true",
        f"https://restcountries.com/v3.1/name/{quote(country_name)}",
    )

    for endpoint in endpoints:
        try:
            response = await client.get(endpoint, timeout=10.0)
            response.raise_for_status()
            payload = response.json()
            country_data = payload[0] if isinstance(payload, list) and payload else payload
            if not isinstance(country_data, dict):
                continue

            country_code = country_data.get("cca2", country_code)
            country_name = country_data.get("name", {}).get("common", country_name)
            continent = country_data.get("region", continent)
            return country_code, country_name, continent
        except Exception:
            continue

    return country_code, country_name, continent