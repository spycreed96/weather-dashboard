from typing import Any

from app.modules.weather.constants import (
    AQI_FALLBACK_INDEX,
    AQI_LABELS,
    O3_BREAKPOINTS,
    PM10_BREAKPOINTS,
    PM25_BREAKPOINTS,
)
from app.modules.weather.schemas import AirQualityMetrics


def interpolate_air_quality_index(
    concentration: float,
    breakpoints: tuple[tuple[float, float, int, int], ...],
) -> float | None:
    """Interpolate an AQI score from pollutant breakpoints."""
    for concentration_low, concentration_high, index_low, index_high in breakpoints:
        if concentration_low <= concentration <= concentration_high:
            return ((index_high - index_low) / (concentration_high - concentration_low)) * (
                concentration - concentration_low
            ) + index_low

    if concentration > breakpoints[-1][1]:
        return float(breakpoints[-1][3])

    return None


def micrograms_per_cubic_meter_to_ppb(value: float, molecular_weight: float) -> float:
    """Convert ug/m3 to ppb using the pollutant molecular weight."""
    return (float(value) * 24.45) / molecular_weight


def build_air_quality_metrics(entry: dict[str, Any] | None) -> AirQualityMetrics:
    """Build display-ready air-quality metrics from WeatherAPI payloads."""
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
    pollutant_scores: list[dict[str, Any]] = []

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
