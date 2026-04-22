from datetime import datetime

import httpx

from core.config import MAX_FORECAST_DAYS
from modules.weather.forecast_builders import build_forecast_day, build_hourly_forecast_points
from modules.weather.schemas import ForecastDay

OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

OPEN_METEO_WEATHER_MAP = {
    0: ("01", "Sereno"),
    1: ("02", "Prevalentemente sereno"),
    2: ("03", "Parzialmente nuvoloso"),
    3: ("04", "Coperto"),
    45: ("50", "Nebbia"),
    48: ("50", "Nebbia intensa"),
    51: ("09", "Pioviggine leggera"),
    53: ("09", "Pioviggine"),
    55: ("09", "Pioviggine intensa"),
    56: ("13", "Pioggia gelata leggera"),
    57: ("13", "Pioggia gelata intensa"),
    61: ("10", "Pioggia leggera"),
    63: ("10", "Pioggia"),
    65: ("10", "Pioggia intensa"),
    66: ("13", "Pioggia gelata leggera"),
    67: ("13", "Pioggia gelata intensa"),
    71: ("13", "Neve debole"),
    73: ("13", "Neve"),
    75: ("13", "Neve intensa"),
    77: ("13", "Granuli di neve"),
    80: ("09", "Rovesci leggeri"),
    81: ("09", "Rovesci"),
    82: ("09", "Rovesci intensi"),
    85: ("13", "Rovesci di neve"),
    86: ("13", "Rovesci di neve intensi"),
    95: ("11", "Temporale"),
    96: ("11", "Temporale con grandine"),
    99: ("11", "Temporale con grandine intensa"),
}


SNOW_WEATHER_CODES = {71, 73, 75, 77, 85, 86}
MIXED_WEATHER_CODES = {56, 57, 66, 67}


def parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None

    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def parse_iso_date(value: str | None):
    parsed_datetime = parse_iso_datetime(value)
    return parsed_datetime.date() if parsed_datetime else None


def get_open_meteo_icon_and_description(weather_code: int | None, hour: int | None = None) -> tuple[str, str]:
    base_icon, description = OPEN_METEO_WEATHER_MAP.get(weather_code, ("03", "Condizioni variabili"))
    is_day = hour is None or 6 <= hour < 18
    return f"{base_icon}{'d' if is_day else 'n'}", description


def normalize_probability(value) -> int | None:
    if value is None or value == "":
        return None

    try:
        return max(0, min(100, round(float(value))))
    except (TypeError, ValueError):
        return None


def classify_open_meteo_precipitation_type(weather_code: int | None, precipitation_mm: float) -> str:
    if precipitation_mm <= 0:
        return "none"

    if weather_code in SNOW_WEATHER_CODES:
        return "snow"

    if weather_code in MIXED_WEATHER_CODES:
        return "mixed"

    return "rain"


async def fetch_open_meteo_forecast(client: httpx.AsyncClient, lat: float, lon: float, timezone: str) -> dict:
    response = await client.get(
        OPEN_METEO_FORECAST_URL,
        params={
            "latitude": lat,
            "longitude": lon,
            "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max",
            "hourly": "temperature_2m,apparent_temperature,precipitation,precipitation_probability,weather_code",
            "timezone": timezone or "auto",
            "forecast_days": MAX_FORECAST_DAYS,
        },
        timeout=15.0,
    )
    response.raise_for_status()
    return response.json()


def build_open_meteo_forecast_days(
    payload: dict,
    current_local_dt: datetime,
    existing_dates: set[str],
) -> list[ForecastDay]:
    daily_payload = payload.get("daily", {})
    hourly_payload = payload.get("hourly", {})
    hourly_entries_by_date: dict[str, list[dict]] = {}

    for index, time_value in enumerate(hourly_payload.get("time", [])):
        local_dt = parse_iso_datetime(time_value)
        if local_dt is None:
            continue

        temperatures = hourly_payload.get("temperature_2m", [])
        apparent_temperatures = hourly_payload.get("apparent_temperature", [])
        precipitations = hourly_payload.get("precipitation", [])
        precipitation_probabilities = hourly_payload.get("precipitation_probability", [])
        weather_codes = hourly_payload.get("weather_code", [])
        temperature = temperatures[index] if index < len(temperatures) else None
        apparent_temperature = apparent_temperatures[index] if index < len(apparent_temperatures) else None
        precipitation_mm = round(float(precipitations[index] if index < len(precipitations) else 0) or 0, 2)
        precipitation_probability = normalize_probability(
            precipitation_probabilities[index] if index < len(precipitation_probabilities) else None
        )
        weather_code = weather_codes[index] if index < len(weather_codes) else None
        icon, description = get_open_meteo_icon_and_description(weather_code, local_dt.hour)
        date_key = local_dt.date().isoformat()

        hourly_entries_by_date.setdefault(date_key, []).append(
            {
                "timestamp": int(local_dt.timestamp()),
                "sort_key": local_dt.hour + (local_dt.minute / 60),
                "hour": local_dt.hour,
                "time_label": local_dt.strftime("%H:%M"),
                "temperature": round(temperature or 0),
                "feels_like": round(apparent_temperature) if apparent_temperature is not None else None,
                "precipitation_mm": precipitation_mm,
                "precipitation_probability": precipitation_probability,
                "precipitation_type": classify_open_meteo_precipitation_type(weather_code, precipitation_mm),
                "icon": icon,
                "description": description,
            }
        )

    forecast_days: list[ForecastDay] = []
    daily_times = daily_payload.get("time", [])
    max_temperatures = daily_payload.get("temperature_2m_max", [])
    precipitation_sums = daily_payload.get("precipitation_sum", [])
    precipitation_probabilities = daily_payload.get("precipitation_probability_max", [])
    weather_codes = daily_payload.get("weather_code", [])

    for index, date_value in enumerate(daily_times):
        target_date = parse_iso_date(f"{date_value}T00:00")
        if target_date is None or date_value in existing_dates:
            continue

        day_entries = hourly_entries_by_date.get(date_value, [])
        if not day_entries:
            continue

        closest_entry = min(day_entries, key=lambda entry: abs(entry["hour"] - current_local_dt.hour))
        # Provide full hourly entries so frontend can render a point and tooltip for every hour
        display_entries = day_entries
        day_icon, day_description = get_open_meteo_icon_and_description(
            weather_codes[index] if index < len(weather_codes) else None,
            13,
        )
        max_temperature = max_temperatures[index] if index < len(max_temperatures) else closest_entry["temperature"]
        precipitation_total_mm = (
            precipitation_sums[index] if index < len(precipitation_sums) else sum(entry.get("precipitation_mm", 0) for entry in day_entries)
        )
        precipitation_probability = normalize_probability(
            precipitation_probabilities[index] if index < len(precipitation_probabilities) else None
        )

        forecast_days.append(
            build_forecast_day(
                target_date,
                current_local_dt.date(),
                max_temperature,
                closest_entry["temperature"],
                closest_entry.get("icon") or day_icon,
                closest_entry.get("description") or day_description,
                build_hourly_forecast_points(display_entries),
                precipitation_total_mm=precipitation_total_mm,
                precipitation_probability=precipitation_probability,
            )
        )

        if len(forecast_days) >= MAX_FORECAST_DAYS:
            break

    return forecast_days
