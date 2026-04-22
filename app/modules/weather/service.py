import logging
from datetime import datetime

import httpx

from core.config import MAX_FORECAST_DAYS
from modules.weather.forecast_builders import calculate_dew_point
from modules.weather.open_meteo_forecast import build_open_meteo_forecast_days, fetch_open_meteo_forecast
from modules.weather.open_meteo_pollen import get_pollen_metrics
from modules.weather.schemas import CitySuggestion, WeatherResponse
from modules.weather.weatherapi_client import (
    build_air_quality_metrics,
    build_forecast_days,
    ensure_weather_api_configured,
    fetch_weatherapi_forecast,
    get_country_metadata,
    get_weatherapi_city_suggestions,
    get_yesterday_forecast_day,
    normalize_weatherapi_icon,
    parse_weatherapi_datetime,
)

DEFAULT_CITY = "Catanzaro"
MAX_LOCATION_QUERY_LENGTH = 80
MAX_CITY_SUGGESTION_LIMIT = 10

logger = logging.getLogger(__name__)


def _ensure_weather_api_ready() -> None:
    try:
        ensure_weather_api_configured()
    except RuntimeError as exc:
        raise WeatherConfigurationError(str(exc)) from exc


def _normalize_required_text(value: str | None, field_label: str) -> str:
    normalized_value = (value or "").strip()
    if not normalized_value:
        raise WeatherInputError(f"{field_label} e obbligatorio.")

    if len(normalized_value) > MAX_LOCATION_QUERY_LENGTH:
        raise WeatherInputError(f"{field_label} e troppo lungo.")

    return normalized_value


def _build_location_query(city: str | None, country: str | None = "") -> str:
    normalized_city = _normalize_required_text(city, "Il nome della citta")
    normalized_country = (country or "").strip()
    if len(normalized_country) > MAX_LOCATION_QUERY_LENGTH:
        raise WeatherInputError("Il paese e troppo lungo.")

    return normalized_city if not normalized_country else f"{normalized_city},{normalized_country}"


def _clamp_suggestion_limit(limit: int) -> int:
    try:
        normalized_limit = int(limit)
    except (TypeError, ValueError):
        normalized_limit = 5

    return max(1, min(normalized_limit, MAX_CITY_SUGGESTION_LIMIT))


def _normalize_suggestion_request(query: str | None, limit: int) -> tuple[str, int]:
    normalized_query = (query or "").strip()
    if len(normalized_query) < 2:
        return "", _clamp_suggestion_limit(limit)

    if len(normalized_query) > MAX_LOCATION_QUERY_LENGTH:
        raise WeatherInputError("La ricerca citta e troppo lunga.")

    return normalized_query, _clamp_suggestion_limit(limit)


def _extract_forecast_payload_sections(forecast_payload: dict) -> tuple[dict, dict, list[dict]]:
    if not isinstance(forecast_payload, dict):
        raise WeatherProviderError("Risposta meteo non valida dal provider.")

    location = forecast_payload.get("location")
    current = forecast_payload.get("current")
    forecast_section = forecast_payload.get("forecast")

    if not isinstance(location, dict) or not isinstance(current, dict) or not isinstance(forecast_section, dict):
        raise WeatherProviderError("Risposta meteo incompleta dal provider.")

    forecast_day_payloads = forecast_section.get("forecastday") or []
    if not isinstance(forecast_day_payloads, list):
        raise WeatherProviderError("Lista previsioni non valida dal provider.")

    return location, current, forecast_day_payloads


def _resolve_current_epoch(current: dict, location: dict, current_local_dt: datetime) -> int:
    for raw_epoch in (current.get("last_updated_epoch"), location.get("localtime_epoch")):
        try:
            return int(raw_epoch)
        except (TypeError, ValueError):
            continue

    return int(current_local_dt.timestamp())


def _build_coordinates_query(location: dict, fallback_query: str) -> str:
    latitude = location.get("lat")
    longitude = location.get("lon")
    if latitude is None or longitude is None:
        return fallback_query

    return f"{latitude},{longitude}"


async def _fetch_primary_forecast(client: httpx.AsyncClient, location_query: str) -> dict:
    try:
        return await fetch_weatherapi_forecast(client, location_query)
    except httpx.HTTPStatusError as exc:
        status_code = exc.response.status_code if exc.response else "unknown"
        logger.warning("WeatherAPI forecast failed for %r with status %s", location_query, status_code, exc_info=True)
        raise WeatherProviderError("WeatherAPI non ha restituito dati meteo validi.") from exc
    except httpx.HTTPError as exc:
        logger.warning("WeatherAPI forecast request failed for %r", location_query, exc_info=True)
        raise WeatherProviderError("WeatherAPI non e raggiungibile.") from exc
    except (RuntimeError, ValueError) as exc:
        logger.warning("WeatherAPI forecast response is not usable for %r", location_query, exc_info=True)
        raise WeatherProviderError("WeatherAPI ha restituito una risposta non valida.") from exc


async def get_weather_data(city: str = DEFAULT_CITY, country: str = "") -> WeatherResponse:
    _ensure_weather_api_ready()
    location_query = _build_location_query(city, country)

    async with httpx.AsyncClient() as client:
        forecast_payload = await _fetch_primary_forecast(client, location_query)
        location, current, forecast_day_payloads = _extract_forecast_payload_sections(forecast_payload)
        current_local_dt = parse_weatherapi_datetime(location.get("localtime")) or datetime.utcnow()
        current_epoch = _resolve_current_epoch(current, location, current_local_dt)
        coordinates_query = _build_coordinates_query(location, location_query)
        country_code, country_name, continent = await get_country_metadata(client, location.get("country", ""))
        state = location.get("region", "")

        forecast_days, dew_point, precipitation_next_24h, pressure_tomorrow, astronomy_context = build_forecast_days(
            forecast_day_payloads,
            current,
            current_local_dt,
            current_epoch,
        )

        if len(forecast_days) < MAX_FORECAST_DAYS:
            latitude = location.get("lat")
            longitude = location.get("lon")
            if latitude is not None and longitude is not None:
                try:
                    open_meteo_payload = await fetch_open_meteo_forecast(
                        client,
                        latitude,
                        longitude,
                        location.get("tz_id") or "auto",
                    )
                    extra_forecast_days = build_open_meteo_forecast_days(
                        open_meteo_payload,
                        current_local_dt,
                        {day.date for day in forecast_days},
                    )
                    forecast_days = [*forecast_days, *extra_forecast_days][:MAX_FORECAST_DAYS]
                except Exception:
                    logger.warning("Open-Meteo forecast fallback failed for %r", location_query, exc_info=True)
            else:
                logger.debug("Open-Meteo fallback skipped for %r: missing coordinates", location_query)

        yesterday_forecast = await get_yesterday_forecast_day(client, coordinates_query, current_local_dt)
        if yesterday_forecast:
            filtered_forecast_days = [day for day in forecast_days if day.date != yesterday_forecast.date]
            forecast_days = [yesterday_forecast, *filtered_forecast_days[: MAX_FORECAST_DAYS - 1]]

        air_quality_entry = current.get("air_quality") or (forecast_day_payloads[0].get("air_quality") if forecast_day_payloads else None)
        pollen_entry = current.get("pollen") or (forecast_day_payloads[0].get("pollen") if forecast_day_payloads else None)
        air_quality_metrics = build_air_quality_metrics(air_quality_entry)
        pollen_metrics = await get_pollen_metrics(client, location.get("lat"), location.get("lon"), pollen_entry)

    current_temperature = round(current.get("temp_c", 0))
    if dew_point is None:
        dew_point = calculate_dew_point(current_temperature, current.get("humidity", 0))

    today_uv = (forecast_day_payloads[0].get("day", {}).get("uv") if forecast_day_payloads else None)
    tomorrow_uv = (forecast_day_payloads[1].get("day", {}).get("uv") if len(forecast_day_payloads) > 1 else None)
    uv_index = round(float(today_uv), 1) if today_uv is not None else None
    uv_index_tomorrow = round(float(tomorrow_uv), 1) if tomorrow_uv is not None else None

    return WeatherResponse(
        name=location.get("name", city),
        country=country_code,
        country_name=country_name,
        continent=continent,
        state=state,
        latitude=location.get("lat", 0.0),
        longitude=location.get("lon", 0.0),
        temperature=current_temperature,
        description=current.get("condition", {}).get("text", ""),
        humidity=current.get("humidity", 0),
        wind_speed=round(current.get("wind_kph", 0), 1),
        wind_gust=round(current.get("gust_kph", 0), 1) if current.get("gust_kph") is not None else None,
        wind_direction=round(current.get("wind_degree")) if current.get("wind_degree") is not None else None,
        icon=normalize_weatherapi_icon(current.get("condition", {}).get("icon")),
        cloudiness=current.get("cloud", 0),
        feels_like=round(current.get("feelslike_c", current_temperature)),
        dew_point=dew_point,
        visibility=round(current.get("vis_km", 0)),
        pressure=round(current.get("pressure_mb", 0)),
        pressure_tomorrow=pressure_tomorrow,
        uv_index=uv_index,
        uv_index_tomorrow=uv_index_tomorrow,
        pollen_index=pollen_metrics["pollen_index"],
        pollen_primary_allergy=pollen_metrics["pollen_primary_allergy"],
        pollen_level=pollen_metrics["pollen_level"],
        sunrise_time=astronomy_context.get("sunrise_time"),
        sunset_time=astronomy_context.get("sunset_time"),
        sun_visibility_minutes=astronomy_context.get("sun_visibility_minutes"),
        sun_progress=astronomy_context.get("sun_progress"),
        moonrise_time=astronomy_context.get("moonrise_time"),
        moonset_time=astronomy_context.get("moonset_time"),
        moon_visibility_minutes=astronomy_context.get("moon_visibility_minutes"),
        moon_phase_label=astronomy_context.get("moon_phase_label"),
        moon_illumination=astronomy_context.get("moon_illumination"),
        next_full_moon_date=astronomy_context.get("next_full_moon_date"),
        moon_progress=astronomy_context.get("moon_progress"),
        air_quality=air_quality_metrics["air_quality"],
        air_quality_index=air_quality_metrics["air_quality_index"],
        air_quality_primary_pollutant=air_quality_metrics["air_quality_primary_pollutant"],
        air_quality_primary_pollutant_value=air_quality_metrics["air_quality_primary_pollutant_value"],
        air_quality_primary_pollutant_unit=air_quality_metrics["air_quality_primary_pollutant_unit"],
        precipitation_next_24h=precipitation_next_24h,
        forecast_days=forecast_days,
    )


async def get_city_suggestions_data(query: str, limit: int = 5) -> list[CitySuggestion]:
    _ensure_weather_api_ready()
    normalized_query, normalized_limit = _normalize_suggestion_request(query, limit)
    if not normalized_query:
        return []

    async with httpx.AsyncClient() as client:
        try:
            suggestions = await get_weatherapi_city_suggestions(client, normalized_query, normalized_limit)
        except httpx.HTTPStatusError as exc:
            status_code = exc.response.status_code if exc.response else "unknown"
            logger.warning(
                "WeatherAPI city suggestions failed for %r with status %s",
                normalized_query,
                status_code,
                exc_info=True,
            )
            raise WeatherProviderError("WeatherAPI non ha restituito suggerimenti validi.") from exc
        except httpx.HTTPError as exc:
            logger.warning("WeatherAPI city suggestions request failed for %r", normalized_query, exc_info=True)
            raise WeatherProviderError("WeatherAPI non e raggiungibile.") from exc
        except ValueError as exc:
            logger.warning("WeatherAPI city suggestions response is not usable for %r", normalized_query, exc_info=True)
            raise WeatherProviderError("WeatherAPI ha restituito suggerimenti non validi.") from exc

    try:
        return [CitySuggestion(**item) for item in suggestions]
    except Exception as exc:
        logger.warning("Invalid city suggestion payload for %r", normalized_query, exc_info=True)
        raise WeatherProviderError("Formato suggerimenti non valido dal provider.") from exc
