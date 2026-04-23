from datetime import date, datetime
from typing import Any


def parse_weatherapi_datetime(value: str | None) -> datetime | None:
    """Parse WeatherAPI local datetime strings."""
    if not value:
        return None

    try:
        return datetime.strptime(value, "%Y-%m-%d %H:%M")
    except ValueError:
        return None


def parse_weatherapi_date(value: str | None) -> date | None:
    """Parse WeatherAPI date strings."""
    if not value:
        return None

    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None


def parse_weatherapi_clock_time(target_date: date, value: str | None) -> datetime | None:
    """Parse WeatherAPI AM/PM clock strings on a target date."""
    if not value or value.lower().startswith("no "):
        return None

    try:
        parsed_time = datetime.strptime(value, "%I:%M %p")
    except ValueError:
        return None

    return datetime.combine(target_date, parsed_time.time())


def format_time_24h(value: datetime | None) -> str | None:
    """Format a datetime as HH:MM for API responses."""
    if value is None:
        return None

    return value.strftime("%H:%M")


def normalize_weatherapi_icon(icon: str | None) -> str:
    """Normalize protocol-relative WeatherAPI icon URLs."""
    if not icon:
        return ""

    if icon.startswith("//"):
        return f"https:{icon}"

    return icon


def normalize_probability(*values: Any) -> int | None:
    """Return the highest valid probability clamped to 0-100."""
    probabilities: list[int] = []
    for value in values:
        if value is None or value == "":
            continue

        try:
            probabilities.append(round(float(value)))
        except (TypeError, ValueError):
            continue

    if not probabilities:
        return None

    return max(0, min(100, max(probabilities)))


def normalize_weatherapi_flag(value: Any) -> bool:
    """Convert WeatherAPI boolean-like flags to bool."""
    if isinstance(value, bool):
        return value

    if value is None:
        return False

    return str(value).strip().lower() in {"1", "true", "yes"}


def normalize_wind_direction(value: Any) -> int | None:
    """Normalize wind direction degrees into the 0-360 range."""
    if value is None or value == "":
        return None

    try:
        return max(0, min(360, round(float(value))))
    except (TypeError, ValueError):
        return None


def normalize_direction(value: Any) -> int | None:
    """Compatibility wrapper: normalize a wind direction into 0–360.

    Historically some modules define `normalize_direction`. Provide a
    small wrapper that delegates to `normalize_wind_direction` so callers
    can import `normalize_direction` from `parse_utils`.
    """
    return normalize_wind_direction(value)


def get_max_hourly_value(hourly_payloads: list[dict[str, Any]], key: str) -> float | None:
    """Return the maximum numeric value for a key across hourly payloads."""
    values: list[float] = []
    for hour_payload in hourly_payloads:
        value = hour_payload.get(key)
        if value is None:
            continue

        try:
            values.append(float(value))
        except (TypeError, ValueError):
            continue

    return max(values) if values else None
