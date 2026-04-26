import math
from datetime import timedelta

from app.modules.weather.constants import WEEKDAY_LABELS
from app.modules.weather.parse_utils import normalize_direction, normalize_probability
from app.modules.weather.schemas import ForecastDay, HourlyForecastPoint


def get_day_label(target_date, current_date) -> str:
    if target_date == current_date - timedelta(days=1):
        return "Ieri"

    if target_date == current_date:
        return "oggi"

    return WEEKDAY_LABELS[target_date.weekday()]


def calculate_dew_point(temperature_celsius: float, humidity: int | float) -> float:
    humidity_ratio = max(min(float(humidity), 100.0), 1.0) / 100.0
    alpha = ((17.27 * float(temperature_celsius)) / (237.7 + float(temperature_celsius))) + math.log(humidity_ratio)
    dew_point = (237.7 * alpha) / (17.27 - alpha)
    return round(dew_point)

def build_hourly_forecast_points(entries: list[dict]) -> list[HourlyForecastPoint]:
    ordered_entries = sorted(entries, key=lambda item: item.get("sort_key", item.get("hour", 0)))

    return [
        HourlyForecastPoint(
            time_label=item.get("time_label", f"{item.get('hour', 0):02d}:00"),
            temperature=round(item.get("temperature", 0)),
            feels_like=round(item["feels_like"]) if item.get("feels_like") is not None else None,
            precipitation_mm=round(float(item.get("precipitation_mm") or 0), 2),
            precipitation_probability=normalize_probability(item.get("precipitation_probability")),
            precipitation_type=item.get("precipitation_type", "none"),
            wind_speed_kph=round(float(item.get("wind_speed_kph") or 0), 1),
            wind_gust_kph=round(float(item["wind_gust_kph"]), 1) if item.get("wind_gust_kph") is not None else None,
            wind_direction=normalize_direction(item.get("wind_direction")),
            wind_direction_label=item.get("wind_direction_label"),
            icon=item.get("icon", ""),
            description=item.get("description", ""),
            is_now=item.get("is_now", False),
        )
        for item in ordered_entries
    ]


def build_forecast_day(
    target_date,
    current_date,
    max_temperature: float,
    current_temperature: float,
    icon: str,
    description: str,
    hourly_forecast: list[HourlyForecastPoint] | None = None,
    moon_phase_label: str | None = None,
    precipitation_total_mm: float = 0,
    precipitation_probability: int | None = None,
    wind_speed_kph: float = 0,
    wind_current_speed_kph: float | None = None,
    wind_gust_kph: float | None = None,
    wind_direction: int | None = None,
    wind_direction_label: str | None = None,
) -> ForecastDay:
    return ForecastDay(
        date=target_date.isoformat(),
        day_of_month=target_date.day,
        label=get_day_label(target_date, current_date),
        max_temperature=round(max_temperature),
        current_temperature=round(current_temperature),
        icon=icon,
        description=description,
        moon_phase_label=moon_phase_label,
        precipitation_total_mm=round(float(precipitation_total_mm or 0), 2),
        precipitation_probability=normalize_probability(precipitation_probability),
        wind_speed_kph=round(float(wind_speed_kph or 0), 1),
        wind_current_speed_kph=round(float(wind_current_speed_kph), 1) if wind_current_speed_kph is not None else None,
        wind_gust_kph=round(float(wind_gust_kph), 1) if wind_gust_kph is not None else None,
        wind_direction=normalize_direction(wind_direction),
        wind_direction_label=wind_direction_label,
        hourly_forecast=hourly_forecast or [],
    )
