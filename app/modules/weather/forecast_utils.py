from datetime import datetime
from typing import Any

from app.modules.weather.parse_utils import (
    normalize_probability,
    normalize_weatherapi_flag,
    normalize_weatherapi_icon,
    normalize_wind_direction,
    parse_weatherapi_datetime,
)
from app.modules.weather.schemas import HourEntry


def classify_precipitation_type(
    precipitation_mm: float,
    rain_probability: int | None,
    snow_probability: int | None,
    will_rain: bool = False,
    will_snow: bool = False,
) -> str:
    """Classify precipitation using WeatherAPI amount and probability flags."""
    if precipitation_mm <= 0:
        return "none"

    has_rain = will_rain or (rain_probability or 0) > 0
    has_snow = will_snow or (snow_probability or 0) > 0

    if has_rain and has_snow:
        return "mixed"

    if has_snow:
        return "snow"

    return "rain"


def build_hour_entry_from_weatherapi(hour_payload: dict[str, Any]) -> HourEntry | None:
    """Convert a WeatherAPI hourly payload into the internal hourly entry shape."""
    local_time = parse_weatherapi_datetime(hour_payload.get("time"))
    if local_time is None:
        return None

    condition = hour_payload.get("condition", {})
    precipitation_mm = round(float(hour_payload.get("precip_mm") or 0), 2)
    rain_probability = normalize_probability(hour_payload.get("chance_of_rain"))
    snow_probability = normalize_probability(hour_payload.get("chance_of_snow"))
    return {
        "timestamp": hour_payload.get("time_epoch") or int(local_time.timestamp()),
        "sort_key": local_time.hour + (local_time.minute / 60),
        "hour": local_time.hour,
        "time_label": local_time.strftime("%H:%M"),
        "temperature": round(hour_payload.get("temp_c", 0)),
        "feels_like": round(hour_payload.get("feelslike_c")) if hour_payload.get("feelslike_c") is not None else None,
        "precipitation_mm": precipitation_mm,
        "precipitation_probability": normalize_probability(rain_probability, snow_probability),
        "precipitation_type": classify_precipitation_type(
            precipitation_mm,
            rain_probability,
            snow_probability,
            normalize_weatherapi_flag(hour_payload.get("will_it_rain")),
            normalize_weatherapi_flag(hour_payload.get("will_it_snow")),
        ),
        "wind_speed_kph": round(float(hour_payload.get("wind_kph") or 0), 1),
        "wind_gust_kph": (
            round(float(hour_payload.get("gust_kph")), 1)
            if hour_payload.get("gust_kph") is not None
            else None
        ),
        "wind_direction": normalize_wind_direction(hour_payload.get("wind_degree")),
        "wind_direction_label": hour_payload.get("wind_dir"),
        "icon": normalize_weatherapi_icon(condition.get("icon")),
        "description": condition.get("text", ""),
        "pressure": round(hour_payload.get("pressure_mb")) if hour_payload.get("pressure_mb") is not None else None,
    }


def build_display_hour_entries(hourly_payloads: list[dict[str, Any]]) -> list[HourEntry]:
    """Build all hourly entries for chart points and tooltips."""
    return [entry for item in hourly_payloads if (entry := build_hour_entry_from_weatherapi(item)) is not None]


def build_current_hour_entry(current_payload: dict[str, Any], current_local_dt: datetime) -> HourEntry:
    """Build the synthetic current-hour entry from the current WeatherAPI payload."""
    condition = current_payload.get("condition", {})
    precipitation_mm = round(float(current_payload.get("precip_mm") or 0), 2)
    return {
        "timestamp": current_payload.get("last_updated_epoch") or int(current_local_dt.timestamp()),
        "sort_key": current_local_dt.hour + (current_local_dt.minute / 60),
        "hour": current_local_dt.hour,
        "time_label": current_local_dt.strftime("%H:%M"),
        "temperature": round(current_payload.get("temp_c", 0)),
        "feels_like": round(current_payload.get("feelslike_c")) if current_payload.get("feelslike_c") is not None else None,
        "precipitation_mm": precipitation_mm,
        "precipitation_probability": None,
        "precipitation_type": "rain" if precipitation_mm > 0 else "none",
        "wind_speed_kph": round(float(current_payload.get("wind_kph") or 0), 1),
        "wind_gust_kph": (
            round(float(current_payload.get("gust_kph")), 1)
            if current_payload.get("gust_kph") is not None
            else None
        ),
        "wind_direction": normalize_wind_direction(current_payload.get("wind_degree")),
        "wind_direction_label": current_payload.get("wind_dir"),
        "icon": normalize_weatherapi_icon(condition.get("icon")),
        "description": condition.get("text", ""),
        "is_now": True,
    }


def get_closest_hour_entry(
    hourly_payloads: list[dict[str, Any]],
    reference_dt: datetime,
) -> dict[str, Any] | None:
    """Return the WeatherAPI hourly payload nearest to the reference datetime."""
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


def calculate_precipitation_next_24h(forecast_days_payload: list[dict[str, Any]], current_epoch: int) -> float:
    """Sum precipitation for forecast hours in the next 24 hours."""
    next_24h_limit = current_epoch + 86400
    total_precipitation = 0.0

    for forecast_day in forecast_days_payload:
        for hour_payload in forecast_day.get("hour", []):
            hour_epoch = hour_payload.get("time_epoch")
            if not hour_epoch or hour_epoch <= current_epoch or hour_epoch > next_24h_limit:
                continue

            total_precipitation += float(hour_payload.get("precip_mm") or 0.0)

    return round(total_precipitation, 1)


def get_reference_pressure(hourly_payloads: list[dict[str, Any]], reference_dt: datetime) -> int | None:
    """Return pressure from the hourly payload nearest to the reference datetime."""
    closest_hour = get_closest_hour_entry(hourly_payloads, reference_dt)
    pressure = closest_hour.get("pressure_mb") if closest_hour else None
    return round(pressure) if pressure is not None else None
