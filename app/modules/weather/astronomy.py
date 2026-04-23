from datetime import date, datetime, timedelta
from math import acos, pi
from typing import Any

from modules.weather.constants import MOON_PHASE_LABELS, SYNODIC_MONTH_DAYS
from modules.weather.parse_utils import format_time_24h, parse_weatherapi_clock_time
from modules.weather.schemas import AstronomyContext


def calculate_span_minutes(start_time: datetime | None, end_time: datetime | None) -> int | None:
    """Calculate a positive visibility span in minutes."""
    if start_time is None or end_time is None:
        return None

    adjusted_end_time = end_time
    if adjusted_end_time <= start_time:
        adjusted_end_time += timedelta(days=1)

    return max(round((adjusted_end_time - start_time).total_seconds() / 60), 0)


def calculate_cycle_progress(
    current_time: datetime,
    start_time: datetime | None,
    end_time: datetime | None,
) -> float | None:
    """Return progress between two daily cycle timestamps."""
    if start_time is None or end_time is None:
        return None

    adjusted_end_time = end_time

    if adjusted_end_time <= start_time:
        adjusted_end_time += timedelta(days=1)

    if adjusted_end_time == start_time:
        return None

    return (current_time - start_time) / (adjusted_end_time - start_time)


def get_moon_cycle_position(moon_phase: str | None, moon_illumination: int | float | None) -> float | None:
    """Estimate the moon cycle position from phase and illumination."""
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


def calculate_next_full_moon_date(
    target_date: date | None,
    moon_phase: str | None,
    moon_illumination: int | float | None,
) -> str | None:
    """Estimate the next full moon date for a WeatherAPI astronomy payload."""
    cycle_position = get_moon_cycle_position(moon_phase, moon_illumination)

    if cycle_position is None or target_date is None:
        return None

    days_until_full_moon = ((0.5 - cycle_position) % 1) * SYNODIC_MONTH_DAYS
    next_full_moon_dt = datetime.combine(target_date, datetime.min.time()) + timedelta(days=days_until_full_moon)

    return next_full_moon_dt.date().isoformat()


def get_moon_phase_label(moon_phase: str | None) -> str | None:
    """Translate WeatherAPI moon phase labels when available."""
    if not moon_phase:
        return None

    return MOON_PHASE_LABELS.get(moon_phase, moon_phase)


def build_astronomy_context(
    astro_payload: dict[str, Any] | None,
    target_date: date | None,
    current_local_dt: datetime,
) -> AstronomyContext:
    """Build astronomy fields used by the weather response."""
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
