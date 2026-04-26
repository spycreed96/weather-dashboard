import logging
from datetime import datetime, timedelta
from urllib.parse import quote

import httpx

from app.core.config import (
    MAX_FORECAST_DAYS,
    WEATHER_API_BASE_URL,
    WEATHER_API_KEY,
    WEATHER_API_LANGUAGE,
)
from app.modules.weather.air_quality import (
    build_air_quality_metrics,
    interpolate_air_quality_index,
    micrograms_per_cubic_meter_to_ppb,
)
from app.modules.weather.astronomy import (
    build_astronomy_context,
    calculate_cycle_progress,
    calculate_next_full_moon_date,
    calculate_span_minutes,
    get_moon_cycle_position,
    get_moon_phase_label,
)
from app.modules.weather.constants import (
    AQI_FALLBACK_INDEX,
    AQI_LABELS,
    DEFAULT_LOCATION_COUNTRY,
    MOON_PHASE_LABELS,
    O3_BREAKPOINTS,
    PM10_BREAKPOINTS,
    PM25_BREAKPOINTS,
    SYNODIC_MONTH_DAYS,
)
from app.modules.weather.forecast_builders import build_forecast_day, build_hourly_forecast_points
from app.modules.weather.forecast_utils import (
    build_current_hour_entry,
    build_display_hour_entries,
    build_hour_entry_from_weatherapi,
    calculate_precipitation_next_24h,
    classify_precipitation_type,
    get_closest_hour_entry,
    get_reference_pressure,
)
from app.modules.weather.http_client import (
    build_country_biased_query,
    ensure_weather_api_configured,
    fetch_weatherapi_forecast,
    fetch_weatherapi_forecast_raw,
    fetch_weatherapi_search_results,
    get_weatherapi_city_suggestions,
    has_explicit_location_context,
    should_retry_without_optional_features,
)
from app.modules.weather.parse_utils import (
    format_time_24h,
    get_max_hourly_value,
    normalize_probability,
    normalize_weatherapi_flag,
    normalize_weatherapi_icon,
    normalize_wind_direction,
    parse_weatherapi_clock_time,
    parse_weatherapi_date,
    parse_weatherapi_datetime,
)
from app.modules.weather.schemas import AstronomyContext, ForecastDay, WeatherApiPayload

logger = logging.getLogger(__name__)

__all__ = [
    "AQI_FALLBACK_INDEX",
    "AQI_LABELS",
    "DEFAULT_LOCATION_COUNTRY",
    "MOON_PHASE_LABELS",
    "O3_BREAKPOINTS",
    "PM10_BREAKPOINTS",
    "PM25_BREAKPOINTS",
    "SYNODIC_MONTH_DAYS",
    "build_air_quality_metrics",
    "build_astronomy_context",
    "build_country_biased_query",
    "build_current_hour_entry",
    "build_display_hour_entries",
    "build_forecast_days",
    "build_hour_entry_from_weatherapi",
    "calculate_cycle_progress",
    "calculate_next_full_moon_date",
    "calculate_precipitation_next_24h",
    "calculate_span_minutes",
    "classify_precipitation_type",
    "ensure_weather_api_configured",
    "fetch_weatherapi_forecast",
    "fetch_weatherapi_forecast_raw",
    "fetch_weatherapi_search_results",
    "format_time_24h",
    "get_closest_hour_entry",
    "get_country_metadata",
    "get_max_hourly_value",
    "get_moon_cycle_position",
    "get_moon_phase_label",
    "get_reference_pressure",
    "get_weatherapi_city_suggestions",
    "get_yesterday_forecast_day",
    "has_explicit_location_context",
    "interpolate_air_quality_index",
    "micrograms_per_cubic_meter_to_ppb",
    "normalize_probability",
    "normalize_weatherapi_flag",
    "normalize_weatherapi_icon",
    "normalize_wind_direction",
    "parse_weatherapi_clock_time",
    "parse_weatherapi_date",
    "parse_weatherapi_datetime",
    "should_retry_without_optional_features",
]


async def get_yesterday_forecast_day(
    client: httpx.AsyncClient,
    query: str,
    current_local_dt: datetime,
) -> ForecastDay | None:
    """Build yesterday's ForecastDay from WeatherAPI history data."""
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
        logger.debug("WeatherAPI history lookup failed for %r", query, exc_info=True)
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
    precipitation_total_mm = round(float(day_payload.get("totalprecip_mm") or 0), 2)
    precipitation_probability = normalize_probability(
        day_payload.get("daily_chance_of_rain"),
        day_payload.get("daily_chance_of_snow"),
    )
    wind_speed_kph = round(float(day_payload.get("maxwind_kph") or 0), 1)
    wind_current_speed_kph = (
        round(float(closest_hour.get("wind_kph")), 1)
        if closest_hour and closest_hour.get("wind_kph") is not None
        else None
    )
    wind_gust_kph = get_max_hourly_value(hourly_payloads, "gust_kph")
    wind_direction = normalize_wind_direction(closest_hour.get("wind_degree")) if closest_hour else None
    wind_direction_label = closest_hour.get("wind_dir") if closest_hour else None
    astronomy_context = build_astronomy_context(forecast_day.get("astro"), yesterday_date, current_local_dt)

    return build_forecast_day(
        yesterday_date,
        current_local_dt.date(),
        max_temperature,
        current_temperature,
        icon,
        description,
        build_hourly_forecast_points(display_entries),
        moon_phase_label=astronomy_context.get("moon_phase_label"),
        precipitation_total_mm=precipitation_total_mm,
        precipitation_probability=precipitation_probability,
        wind_speed_kph=wind_speed_kph,
        wind_current_speed_kph=wind_current_speed_kph,
        wind_gust_kph=wind_gust_kph,
        wind_direction=wind_direction,
        wind_direction_label=wind_direction_label,
    )


def build_forecast_days(
    forecast_day_payloads: list[WeatherApiPayload],
    current_payload: WeatherApiPayload,
    current_local_dt: datetime,
    current_epoch: int,
) -> tuple[list[ForecastDay], float | None, float, int | None, AstronomyContext]:
    """Build ForecastDay models and aggregate WeatherAPI-derived context."""
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
        day_astronomy_context = build_astronomy_context(forecast_day.get("astro"), target_date, current_local_dt)
        reference_dt = datetime.combine(target_date, current_local_dt.time())
        closest_hour = get_closest_hour_entry(hourly_payloads, reference_dt)

        day_condition = day_payload.get("condition", {})
        icon = normalize_weatherapi_icon(day_condition.get("icon"))
        description = day_condition.get("text", "")
        current_like_temperature = day_payload.get("avgtemp_c", day_payload.get("maxtemp_c", 0))
        precipitation_total_mm = round(float(day_payload.get("totalprecip_mm") or 0), 2)
        precipitation_probability = normalize_probability(
            day_payload.get("daily_chance_of_rain"),
            day_payload.get("daily_chance_of_snow"),
        )
        wind_speed_kph = round(float(day_payload.get("maxwind_kph") or 0), 1)
        wind_current_speed_kph = (
            round(float(closest_hour.get("wind_kph")), 1)
            if closest_hour and closest_hour.get("wind_kph") is not None
            else None
        )
        wind_gust_kph = get_max_hourly_value(hourly_payloads, "gust_kph")
        wind_direction = normalize_wind_direction(closest_hour.get("wind_degree")) if closest_hour else None
        wind_direction_label = closest_hour.get("wind_dir") if closest_hour else None

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
            wind_current_speed_kph = round(float(current_payload.get("wind_kph") or 0), 1)
            wind_direction = normalize_wind_direction(current_payload.get("wind_degree")) or wind_direction
            wind_direction_label = current_payload.get("wind_dir") or wind_direction_label
            if current_payload.get("gust_kph") is not None:
                current_gust = float(current_payload.get("gust_kph"))
                wind_gust_kph = max(wind_gust_kph or current_gust, current_gust)

        forecast_days.append(
            build_forecast_day(
                target_date,
                current_local_dt.date(),
                day_payload.get("maxtemp_c", current_like_temperature),
                current_like_temperature,
                icon,
                description,
                build_hourly_forecast_points(display_entries),
                moon_phase_label=day_astronomy_context.get("moon_phase_label"),
                precipitation_total_mm=precipitation_total_mm,
                precipitation_probability=precipitation_probability,
                wind_speed_kph=wind_speed_kph,
                wind_current_speed_kph=wind_current_speed_kph,
                wind_gust_kph=wind_gust_kph,
                wind_direction=wind_direction,
                wind_direction_label=wind_direction_label,
            )
        )

    return forecast_days[:MAX_FORECAST_DAYS], dew_point, precipitation_next_24h, pressure_tomorrow, astronomy_context


async def get_country_metadata(client: httpx.AsyncClient, country_name: str) -> tuple[str, str, str]:
    """Resolve country code, display name, and continent from Rest Countries."""
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
            logger.debug("Country metadata lookup failed for %r via %s", country_name, endpoint, exc_info=True)
            continue

    return country_code, country_name, continent
