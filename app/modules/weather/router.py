import logging

from fastapi import APIRouter, HTTPException, Query

from modules.weather.schemas import CitySuggestion, WeatherResponse
from modules.weather.service import (
    WeatherConfigurationError,
    WeatherInputError,
    WeatherProviderError,
    get_city_suggestions_data,
    get_weather_data,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/weather", response_model=WeatherResponse)
async def get_weather(city: str = Query("Catanzaro", min_length=1, max_length=80)):
    try:
        return await get_weather_data(city)
    except WeatherInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except WeatherConfigurationError as exc:
        logger.exception("Weather provider configuration error")
        raise HTTPException(status_code=503, detail="Servizio meteo non configurato.") from exc
    except WeatherProviderError as exc:
        logger.warning("Weather provider error for city %r: %s", city, exc)
        raise HTTPException(status_code=502, detail="Provider meteo temporaneamente non disponibile.") from exc
    except Exception as exc:
        logger.exception("Unexpected error while retrieving weather for city %r", city)
        raise HTTPException(status_code=500, detail="Errore interno nel recupero dati meteo.") from exc


@router.get("/cities", response_model=list[CitySuggestion])
async def get_city_suggestions(
    q: str = Query(..., min_length=2, max_length=80),
    limit: int = Query(5, ge=1, le=10),
):
    try:
        return await get_city_suggestions_data(q, limit)
    except WeatherInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except WeatherConfigurationError as exc:
        logger.exception("Weather provider configuration error")
        raise HTTPException(status_code=503, detail="Servizio meteo non configurato.") from exc
    except WeatherProviderError as exc:
        logger.warning("Weather provider error while retrieving city suggestions for %r: %s", q, exc)
        raise HTTPException(status_code=502, detail="Suggerimenti citta temporaneamente non disponibili.") from exc
    except Exception as exc:
        logger.exception("Unexpected error while retrieving city suggestions for %r", q)
        raise HTTPException(status_code=500, detail="Errore interno nel recupero suggerimenti.") from exc
