import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.core.exceptions import (
    WeatherConfigurationError,
    WeatherInputError,
    WeatherProviderError,
)
from app.modules.weather.constants import (
    DEFAULT_CITY,
    MAX_CITY_SUGGESTION_LIMIT,
    MAX_LOCATION_QUERY_LENGTH,
    MIN_CITY_SUGGESTION_QUERY_LENGTH,
)
from app.modules.weather.schemas import CitySuggestion, WeatherResponse
from app.modules.weather.service import (
    get_city_suggestions_data,
    get_weather_data,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def _build_weather_http_exception(
    exc: Exception,
    *,
    context_value: Any,
    provider_log_message: str,
    provider_detail: str,
    internal_detail: str,
) -> HTTPException:
    if isinstance(exc, WeatherInputError):
        return HTTPException(status_code=422, detail=str(exc))

    if isinstance(exc, WeatherConfigurationError):
        logger.exception("Weather provider configuration error")
        return HTTPException(status_code=503, detail="Servizio meteo non configurato.")

    if isinstance(exc, WeatherProviderError):
        logger.warning(provider_log_message, context_value, exc)
        return HTTPException(status_code=502, detail=provider_detail)

    logger.exception("Unexpected weather backend error for %r", context_value)
    return HTTPException(status_code=500, detail=internal_detail)


@router.get("/weather", response_model=WeatherResponse)
async def get_weather(
    city: str = Query(DEFAULT_CITY, min_length=1, max_length=MAX_LOCATION_QUERY_LENGTH),
):
    try:
        return await get_weather_data(city)
    except Exception as exc:
        raise _build_weather_http_exception(
            exc,
            context_value=city,
            provider_log_message="Weather provider error for city %r: %s",
            provider_detail="Provider meteo temporaneamente non disponibile.",
            internal_detail="Errore interno nel recupero dati meteo.",
        ) from exc


@router.get("/cities", response_model=list[CitySuggestion])
async def get_city_suggestions(
    q: str = Query(..., min_length=MIN_CITY_SUGGESTION_QUERY_LENGTH, max_length=MAX_LOCATION_QUERY_LENGTH),
    limit: int = Query(5, ge=1, le=MAX_CITY_SUGGESTION_LIMIT),
):
    try:
        return await get_city_suggestions_data(q, limit)
    except Exception as exc:
        raise _build_weather_http_exception(
            exc,
            context_value=q,
            provider_log_message="Weather provider error while retrieving city suggestions for %r: %s",
            provider_detail="Suggerimenti citta temporaneamente non disponibili.",
            internal_detail="Errore interno nel recupero suggerimenti.",
        ) from exc
