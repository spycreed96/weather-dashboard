import math
from datetime import datetime, timedelta

from modules.weather.schemas import ForecastDay, HourlyForecastPoint

WEEKDAY_LABELS = (
    "lunedi",
    "martedi",
    "mercoledi",
    "giovedi",
    "venerdi",
    "sabato",
    "domenica",
)


def get_local_datetime(timestamp: int, timezone_offset: int) -> datetime:
    return datetime.utcfromtimestamp(timestamp + timezone_offset)


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
            icon=item.get("icon", ""),
            description=item.get("description", ""),
            is_now=item.get("is_now", False),
        )
        for item in ordered_entries
    ]


def build_synthetic_hourly_forecast(
    temperature_data: dict,
    icon: str,
    description: str,
    current_temperature: float | None = None,
    current_sort_key: float | None = None,
) -> list[HourlyForecastPoint]:
    synthetic_entries = []
    slots = (
        (3, temperature_data.get("night", temperature_data.get("min", temperature_data.get("day", 0)))),
        (7, temperature_data.get("morn", temperature_data.get("day", 0))),
        (13, temperature_data.get("day", temperature_data.get("max", 0))),
        (19, temperature_data.get("eve", temperature_data.get("day", 0))),
        (23, temperature_data.get("night", temperature_data.get("min", temperature_data.get("day", 0)))),
    )

    for hour, value in slots:
        if value is None:
            continue

        synthetic_entries.append(
            {
                "sort_key": hour,
                "hour": hour,
                "time_label": f"{hour:02d}:00",
                "temperature": value,
                "icon": icon,
                "description": description,
            }
        )

    if current_temperature is not None and current_sort_key is not None:
        synthetic_entries.append(
            {
                "sort_key": current_sort_key,
                "time_label": "Adesso",
                "temperature": current_temperature,
                "icon": icon,
                "description": description,
                "is_now": True,
            }
        )

    return build_hourly_forecast_points(synthetic_entries)


def build_forecast_day(
    target_date,
    current_date,
    max_temperature: float,
    current_temperature: float,
    icon: str,
    description: str,
    hourly_forecast: list[HourlyForecastPoint] | None = None,
) -> ForecastDay:
    return ForecastDay(
        date=target_date.isoformat(),
        day_of_month=target_date.day,
        label=get_day_label(target_date, current_date),
        max_temperature=round(max_temperature),
        current_temperature=round(current_temperature),
        icon=icon,
        description=description,
        hourly_forecast=hourly_forecast or [],
    )


def build_hourly_forecast_lookup(
    entries: list,
    timezone_offset: int,
    current_temperature: float,
    current_icon: str,
    current_description: str,
    current_timestamp: int,
) -> dict[str, dict]:
    current_local_dt = get_local_datetime(current_timestamp, timezone_offset)
    grouped_entries: dict[str, dict] = {}

    for entry in entries:
        local_dt = get_local_datetime(entry["dt"], timezone_offset)
        date_key = local_dt.date().isoformat()
        grouped_entries.setdefault(date_key, {"date": local_dt.date(), "items": []})["items"].append(
            {
                "timestamp": entry["dt"],
                "sort_key": local_dt.hour + (local_dt.minute / 60),
                "hour": local_dt.hour,
                "time_label": local_dt.strftime("%H:%M"),
                "temperature": round(entry["main"].get("temp", 0)),
                "max_temp": round(entry["main"].get("temp_max", entry["main"].get("temp", 0))),
                "icon": entry.get("weather", [{}])[0].get("icon", ""),
                "description": entry.get("weather", [{}])[0].get("description", ""),
            }
        )

    today_key = current_local_dt.date().isoformat()
    grouped_entries.setdefault(today_key, {"date": current_local_dt.date(), "items": []})
    grouped_entries[today_key]["items"].append(
        {
            "timestamp": current_timestamp,
            "sort_key": current_local_dt.hour + (current_local_dt.minute / 60),
            "hour": current_local_dt.hour,
            "time_label": "Adesso",
            "temperature": round(current_temperature),
            "max_temp": round(current_temperature),
            "icon": current_icon,
            "description": current_description,
            "is_now": True,
        }
    )

    forecast_lookup: dict[str, dict] = {}
    for date_key, day_group in grouped_entries.items():
        day_entries = day_group["items"]
        closest_entry = min(
            day_entries,
            key=lambda item: (
                abs(item["hour"] - current_local_dt.hour),
                abs(item["timestamp"] - current_timestamp),
            ),
        )

        max_temperature = max(item["max_temp"] for item in day_entries)
        current_like_temperature = closest_entry["temperature"]
        icon = closest_entry["icon"]
        description = closest_entry["description"]

        if day_group["date"] == current_local_dt.date():
            max_temperature = max(max_temperature, round(current_temperature))
            current_like_temperature = round(current_temperature)
            icon = current_icon
            description = current_description

        forecast_lookup[date_key] = {
            "date": day_group["date"],
            "max_temperature": max_temperature,
            "current_temperature": current_like_temperature,
            "icon": icon,
            "description": description,
            "hourly_forecast": build_hourly_forecast_points(day_entries),
        }

    return forecast_lookup


def build_forecast_days_from_lookup(hourly_lookup: dict[str, dict], current_date) -> list[ForecastDay]:
    forecast_days: list[ForecastDay] = []

    for date_key in sorted(hourly_lookup):
        day_data = hourly_lookup[date_key]
        forecast_days.append(
            build_forecast_day(
                day_data["date"],
                current_date,
                day_data["max_temperature"],
                day_data["current_temperature"],
                day_data["icon"],
                day_data["description"],
                day_data.get("hourly_forecast", []),
            )
        )

    return forecast_days


def calculate_precipitation_next_24h(entries: list[dict], current_timestamp: int) -> float:
    next_24h_limit = current_timestamp + 86400
    total_precipitation = 0.0

    for entry in entries:
        entry_timestamp = entry.get("dt")
        if not entry_timestamp or entry_timestamp <= current_timestamp or entry_timestamp > next_24h_limit:
            continue

        rain_volume = float(entry.get("rain", {}).get("3h", 0) or 0)
        snow_volume = float(entry.get("snow", {}).get("3h", 0) or 0)
        total_precipitation += rain_volume + snow_volume

    return round(total_precipitation, 1)