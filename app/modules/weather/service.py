import httpx

from core.config import API_KEY, BASE_URL, MAX_FORECAST_DAYS, ONE_CALL_TIMEMACHINE_URL, ONE_CALL_URL
from modules.weather.forecast_builders import (
    build_forecast_day,
    build_forecast_days_from_lookup,
    build_hourly_forecast_lookup,
    build_hourly_forecast_points,
    build_synthetic_hourly_forecast,
    calculate_dew_point,
    calculate_precipitation_next_24h,
    get_local_datetime,
)
from modules.weather.schemas import ForecastDay, WeatherResponse

AQI_LABELS = {
    1: "Buona",
    2: "Accettabile",
    3: "Moderata",
    4: "Cattiva",
    5: "Molto cattiva",
}

AQI_FALLBACK_INDEX = {
    1: 25,
    2: 75,
    3: 125,
    4: 175,
    5: 250,
}

POLLEN_LABELS = {
    "alder_pollen": "Ontano",
    "birch_pollen": "Betulla",
    "grass_pollen": "Graminacee",
    "mugwort_pollen": "Artemisia",
    "olive_pollen": "Olivo",
    "ragweed_pollen": "Ambrosia",
}

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


def build_air_quality_metrics(entry: dict | None) -> dict:
    if not entry:
        return {
            "air_quality": "N/A",
            "air_quality_index": None,
            "air_quality_primary_pollutant": None,
            "air_quality_primary_pollutant_value": None,
            "air_quality_primary_pollutant_unit": None,
        }

    bucket = entry.get("main", {}).get("aqi")
    components = entry.get("components", {})
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


def get_pollen_level(pollen_index: int | None) -> str | None:
    if pollen_index is None:
        return None

    if pollen_index == 0:
        return "Assente"

    if pollen_index <= 25:
        return "Basso"

    if pollen_index <= 50:
        return "Moderata"

    if pollen_index <= 75:
        return "Alta"

    return "Molto alta"


def build_pollen_metrics(current_payload: dict | None) -> dict:
    if not current_payload:
        return {
            "pollen_index": None,
            "pollen_primary_allergy": None,
            "pollen_level": None,
        }

    candidates = []
    for field_name, label in POLLEN_LABELS.items():
        value = current_payload.get(field_name)
        if value is None:
            continue

        candidates.append(
            {
                "label": label,
                "value": max(float(value), 0.0),
            }
        )

    primary = max(candidates, key=lambda item: item["value"], default=None)
    if primary is None:
        return {
            "pollen_index": None,
            "pollen_primary_allergy": None,
            "pollen_level": None,
        }

    pollen_index = min(100, round(primary["value"]))
    return {
        "pollen_index": pollen_index,
        "pollen_primary_allergy": primary["label"] if primary["value"] > 0 else None,
        "pollen_level": get_pollen_level(pollen_index),
    }


def format_local_time(timestamp: int | None, timezone_offset: int) -> str | None:
    if timestamp is None:
        return None

    return get_local_datetime(timestamp, timezone_offset).strftime("%H:%M")


def calculate_span_minutes(start_timestamp: int | None, end_timestamp: int | None) -> int | None:
    if start_timestamp is None or end_timestamp is None:
        return None

    end_value = end_timestamp
    if end_value <= start_timestamp:
        end_value += 86400

    return max(round((end_value - start_timestamp) / 60), 0)


def calculate_cycle_progress(current_timestamp: int, start_timestamp: int | None, end_timestamp: int | None) -> float | None:
    if start_timestamp is None or end_timestamp is None:
        return None

    start_value = start_timestamp
    end_value = end_timestamp
    current_value = current_timestamp

    if end_value <= start_value:
        end_value += 86400
        if current_value < start_value:
            current_value += 86400

    if end_value == start_value:
        return None

    return max(0.0, min(1.0, (current_value - start_value) / (end_value - start_value)))


def get_moon_phase_label(moon_phase: float | None) -> str | None:
    if moon_phase is None:
        return None

    if moon_phase < 0.03 or moon_phase >= 0.97:
        return "Luna nuova"

    if moon_phase < 0.22:
        return "Falce crescente"

    if moon_phase < 0.28:
        return "Primo quarto"

    if moon_phase < 0.47:
        return "Gibbosa crescente"

    if moon_phase < 0.53:
        return "Luna piena"

    if moon_phase < 0.72:
        return "Gibbosa calante"

    if moon_phase < 0.78:
        return "Ultimo quarto"

    return "Falce calante"


def build_astronomy_context(daily_entries: list[dict], timezone_offset: int, current_timestamp: int) -> dict:
    if not daily_entries:
        return {
            "moonrise_time": None,
            "moonset_time": None,
            "moon_visibility_minutes": None,
            "moon_phase_label": None,
            "moon_progress": None,
        }

    today_entry = daily_entries[0]
    moonrise_timestamp = today_entry.get("moonrise")
    moonset_timestamp = today_entry.get("moonset")
    moon_phase = today_entry.get("moon_phase")

    return {
        "moonrise_time": format_local_time(moonrise_timestamp, timezone_offset),
        "moonset_time": format_local_time(moonset_timestamp, timezone_offset),
        "moon_visibility_minutes": calculate_span_minutes(moonrise_timestamp, moonset_timestamp),
        "moon_phase_label": get_moon_phase_label(moon_phase),
        "moon_progress": calculate_cycle_progress(current_timestamp, moonrise_timestamp, moonset_timestamp),
    }


async def get_hourly_forecast_lookup(
    client: httpx.AsyncClient,
    lat: float,
    lon: float,
    timezone_offset: int,
    current_temperature: float,
    current_icon: str,
    current_description: str,
    current_timestamp: int,
) -> tuple[dict[str, dict], float]:
    forecast_url = f"{BASE_URL}/forecast?lat={lat}&lon={lon}&appid={API_KEY}&units=metric&lang=it"

    response = await client.get(forecast_url)
    response.raise_for_status()
    payload = response.json()

    entries = payload.get("list", [])

    return (
        build_hourly_forecast_lookup(
            entries,
            timezone_offset,
            current_temperature,
            current_icon,
            current_description,
            current_timestamp,
        ),
        calculate_precipitation_next_24h(entries, current_timestamp),
    )


async def get_yesterday_forecast_day(
    client: httpx.AsyncClient,
    lat: float,
    lon: float,
    timezone_offset: int,
    current_timestamp: int,
) -> ForecastDay | None:
    yesterday_timestamp = current_timestamp - 86400
    current_local_dt = get_local_datetime(current_timestamp, timezone_offset)
    yesterday_local_dt = get_local_datetime(yesterday_timestamp, timezone_offset)
    yesterday_url = (
        f"{ONE_CALL_TIMEMACHINE_URL}?lat={lat}&lon={lon}&dt={yesterday_timestamp}&appid={API_KEY}&units=metric&lang=it"
    )

    try:
        response = await client.get(yesterday_url)
        response.raise_for_status()
        payload = response.json()
    except Exception:
        return None

    data_points = payload.get("data") or payload.get("hourly") or []
    if not data_points:
        return None

    yesterday_entries = []
    yesterday_chart_entries = []
    for item in data_points:
        item_timestamp = item.get("dt")
        if not item_timestamp:
            continue

        local_dt = get_local_datetime(item_timestamp, timezone_offset)
        if local_dt.date() != yesterday_local_dt.date():
            continue

        entry = {
            "timestamp": item_timestamp,
            "sort_key": local_dt.hour + (local_dt.minute / 60),
            "hour": local_dt.hour,
            "time_label": local_dt.strftime("%H:%M"),
            "temperature": round(item.get("temp", 0)),
            "icon": item.get("weather", [{}])[0].get("icon", ""),
            "description": item.get("weather", [{}])[0].get("description", ""),
        }
        yesterday_entries.append(entry)

        if local_dt.minute == 0 and local_dt.hour % 3 == 0:
            yesterday_chart_entries.append(entry)

    if not yesterday_entries:
        return None

    closest_entry = min(
        yesterday_entries,
        key=lambda item: (
            abs(item["hour"] - current_local_dt.hour),
            abs(item["timestamp"] - yesterday_timestamp),
        ),
    )

    max_temperature = max(item["temperature"] for item in yesterday_entries)
    chart_entries = yesterday_chart_entries or yesterday_entries[::3] or yesterday_entries

    return build_forecast_day(
        yesterday_local_dt.date(),
        current_local_dt.date(),
        max_temperature,
        closest_entry["temperature"],
        closest_entry["icon"],
        closest_entry["description"],
        build_hourly_forecast_points(chart_entries),
    )


async def get_forecast_days(
    client: httpx.AsyncClient,
    lat: float,
    lon: float,
    timezone_offset: int,
    current_temperature: float,
    current_icon: str,
    current_description: str,
    current_timestamp: int,
) -> tuple[list[ForecastDay], float | None, float, int | None, dict]:
    current_local_dt = get_local_datetime(current_timestamp, timezone_offset)
    current_sort_key = current_local_dt.hour + (current_local_dt.minute / 60)
    hourly_lookup: dict[str, dict] = {}
    precipitation_next_24h = 0.0

    try:
        hourly_lookup, precipitation_next_24h = await get_hourly_forecast_lookup(
            client,
            lat,
            lon,
            timezone_offset,
            current_temperature,
            current_icon,
            current_description,
            current_timestamp,
        )
    except Exception:
        hourly_lookup = {}

    yesterday_forecast = await get_yesterday_forecast_day(
        client,
        lat,
        lon,
        timezone_offset,
        current_timestamp,
    )

    one_call_url = (
        f"{ONE_CALL_URL}?lat={lat}&lon={lon}&exclude=minutely,hourly,alerts&appid={API_KEY}&units=metric&lang=it"
    )

    try:
        response = await client.get(one_call_url)
        response.raise_for_status()
        payload = response.json()
        current_payload = payload.get("current", {})
        current_dew_point = current_payload.get("dew_point")
        dew_point = round(current_dew_point) if current_dew_point is not None else None
        daily_entries = payload.get("daily", [])
        tomorrow_entry = daily_entries[1] if len(daily_entries) > 1 else None
        pressure_tomorrow = round(tomorrow_entry.get("pressure")) if tomorrow_entry and tomorrow_entry.get("pressure") is not None else None
        astronomy_context = build_astronomy_context(daily_entries, timezone_offset, current_timestamp)

        forecast_days: list[ForecastDay] = []
        for entry in daily_entries:
            target_date = get_local_datetime(entry["dt"], timezone_offset).date()
            lookup_entry = hourly_lookup.get(target_date.isoformat(), {})
            temperature_data = entry.get("temp", {})
            weather_entry = entry.get("weather", [{}])[0]

            max_temperature = lookup_entry.get(
                "max_temperature",
                round(temperature_data.get("max", temperature_data.get("day", 0))),
            )
            current_like_temperature = lookup_entry.get(
                "current_temperature",
                round(temperature_data.get("day", temperature_data.get("max", 0))),
            )
            icon = lookup_entry.get("icon", weather_entry.get("icon", ""))
            description = lookup_entry.get("description", weather_entry.get("description", ""))
            hourly_forecast = lookup_entry.get("hourly_forecast") or build_synthetic_hourly_forecast(
                temperature_data,
                icon,
                description,
                current_temperature if target_date == current_local_dt.date() else None,
                current_sort_key if target_date == current_local_dt.date() else None,
            )

            if target_date == current_local_dt.date():
                max_temperature = max(max_temperature, round(current_temperature))
                current_like_temperature = round(current_temperature)
                icon = current_icon
                description = current_description

            forecast_days.append(
                build_forecast_day(
                    target_date,
                    current_local_dt.date(),
                    max_temperature,
                    current_like_temperature,
                    icon,
                    description,
                    hourly_forecast,
                )
            )

        if yesterday_forecast:
            return (
                [yesterday_forecast, *forecast_days[: MAX_FORECAST_DAYS - 1]],
                dew_point,
                precipitation_next_24h,
                pressure_tomorrow,
                astronomy_context,
            )

        return forecast_days[:MAX_FORECAST_DAYS], dew_point, precipitation_next_24h, pressure_tomorrow, astronomy_context
    except Exception:
        forecast_days = build_forecast_days_from_lookup(hourly_lookup, current_local_dt.date())

        if yesterday_forecast:
            filtered_days = [day for day in forecast_days if day.date != yesterday_forecast.date]
            return [yesterday_forecast, *filtered_days[: MAX_FORECAST_DAYS - 1]], None, precipitation_next_24h, None, {}

        return forecast_days[:MAX_FORECAST_DAYS], None, precipitation_next_24h, None, {}


async def get_country_metadata(client: httpx.AsyncClient, country_code: str) -> tuple[str, str]:
    country_name = country_code.upper()
    continent = ""

    if not country_code:
        return country_name, continent

    restcountries_url = f"https://restcountries.com/v3.1/alpha/{country_code}"

    try:
        response = await client.get(restcountries_url, timeout=10.0)
        response.raise_for_status()
        payload = response.json()
        country_data = payload[0] if isinstance(payload, list) and payload else payload

        country_name = country_data.get("name", {}).get("common", country_name)
        continent = country_data.get("region", continent)
    except Exception:
        pass

    return country_name, continent


async def get_state_metadata(client: httpx.AsyncClient, lat: float, lon: float) -> str:
    reverse_geo_url = (
        f"https://api.openweathermap.org/geo/1.0/reverse?lat={lat}&lon={lon}&limit=1&appid={API_KEY}"
    )

    try:
        response = await client.get(reverse_geo_url, timeout=10.0)
        response.raise_for_status()
        payload = response.json()

        if payload:
            return payload[0].get("state", "")
    except Exception:
        pass

    return ""


async def get_pollen_metrics(client: httpx.AsyncClient, lat: float, lon: float) -> dict:
    pollen_url = (
        "https://air-quality-api.open-meteo.com/v1/air-quality"
        f"?latitude={lat}&longitude={lon}"
        "&current=alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen"
        "&domains=cams_europe&timezone=auto&forecast_days=1"
    )

    try:
        response = await client.get(pollen_url, timeout=10.0)
        response.raise_for_status()
        payload = response.json()
        return build_pollen_metrics(payload.get("current"))
    except Exception:
        return build_pollen_metrics(None)


async def get_weather_data(city: str = "Catanzaro", country: str = "") -> WeatherResponse:
    location_query = city if not country else f"{city},{country}"
    url = f"{BASE_URL}/weather?q={location_query}&appid={API_KEY}&units=metric&lang=it"

    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        response.raise_for_status()
        data = response.json()
        country_code = data.get("sys", {}).get("country", country.upper())
        country_name, continent = await get_country_metadata(client, country_code)
        lat = data["coord"]["lat"]
        lon = data["coord"]["lon"]
        timezone_offset = data.get("timezone", 0)
        current_timestamp = data.get("dt", 0)
        current_temperature = round(data["main"]["temp"])
        current_icon = data["weather"][0]["icon"]
        current_description = data["weather"][0]["description"]
        state = await get_state_metadata(client, lat, lon)

        air_url = f"https://api.openweathermap.org/data/2.5/air_pollution?lat={lat}&lon={lon}&appid={API_KEY}"
        air_quality_metrics = build_air_quality_metrics(None)
        try:
            air_response = await client.get(air_url)
            air_response.raise_for_status()
            air_data = air_response.json()
            air_quality_metrics = build_air_quality_metrics((air_data.get("list") or [None])[0])
        except Exception:
            air_quality_metrics = build_air_quality_metrics(None)

        pollen_metrics = await get_pollen_metrics(client, lat, lon)

        try:
            forecast_days, dew_point, precipitation_next_24h, pressure_tomorrow, astronomy_context = await get_forecast_days(
                client,
                lat,
                lon,
                timezone_offset,
                current_temperature,
                current_icon,
                current_description,
                current_timestamp,
            )
        except Exception:
            forecast_days = []
            dew_point = None
            precipitation_next_24h = 0.0
            pressure_tomorrow = None
            astronomy_context = {}

    if dew_point is None:
        dew_point = calculate_dew_point(current_temperature, data["main"]["humidity"])

    return WeatherResponse(
        name=data["name"],
        country=country_code,
        country_name=country_name,
        continent=continent,
        state=state,
        latitude=lat,
        longitude=lon,
        temperature=current_temperature,
        description=data["weather"][0]["description"],
        humidity=data["main"]["humidity"],
        wind_speed=round(data["wind"]["speed"] * 3.6, 1),
        wind_gust=round(data["wind"]["gust"] * 3.6, 1) if data.get("wind", {}).get("gust") is not None else None,
        wind_direction=round(data["wind"]["deg"]) if data.get("wind", {}).get("deg") is not None else None,
        icon=data["weather"][0]["icon"],
        cloudiness=data.get("clouds", {}).get("all", 0),
        feels_like=round(data["main"]["feels_like"]),
        dew_point=dew_point,
        visibility=round(data.get("visibility", 10000) / 1000),
        pressure=data["main"]["pressure"],
        pressure_tomorrow=pressure_tomorrow,
        pollen_index=pollen_metrics["pollen_index"],
        pollen_primary_allergy=pollen_metrics["pollen_primary_allergy"],
        pollen_level=pollen_metrics["pollen_level"],
        moonrise_time=astronomy_context.get("moonrise_time"),
        moonset_time=astronomy_context.get("moonset_time"),
        moon_visibility_minutes=astronomy_context.get("moon_visibility_minutes"),
        moon_phase_label=astronomy_context.get("moon_phase_label"),
        moon_progress=astronomy_context.get("moon_progress"),
        air_quality=air_quality_metrics["air_quality"],
        air_quality_index=air_quality_metrics["air_quality_index"],
        air_quality_primary_pollutant=air_quality_metrics["air_quality_primary_pollutant"],
        air_quality_primary_pollutant_value=air_quality_metrics["air_quality_primary_pollutant_value"],
        air_quality_primary_pollutant_unit=air_quality_metrics["air_quality_primary_pollutant_unit"],
        precipitation_next_24h=precipitation_next_24h,
        forecast_days=forecast_days,
    )


async def get_city_suggestions_data(query: str, limit: int = 5) -> list:
    geo_url = f"https://api.openweathermap.org/geo/1.0/direct?q={query}&limit={limit}&appid={API_KEY}"

    async with httpx.AsyncClient() as client:
        response = await client.get(geo_url)
        response.raise_for_status()
        data = response.json()

    suggestions = []
    for item in data:
        name = item.get("name", "")
        state = item.get("state", "")
        country = item.get("country", "")
        if name:
            suggestions.append(
                {
                    "name": name,
                    "region_country": f"{state}, {country}" if state else country,
                    "full_name": f"{name},{country}",
                }
            )

    return suggestions
