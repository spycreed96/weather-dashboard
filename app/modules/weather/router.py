from fastapi import APIRouter, HTTPException

from modules.weather.service import get_city_suggestions_data, get_weather_data

router = APIRouter()


@router.get("/weather")
async def get_weather(city: str = "Catanzaro"):
    try:
        weather = await get_weather_data(city)
        return weather.dict()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Errore nel recupero dati meteo: {str(exc)}")


@router.get("/cities")
async def get_city_suggestions(q: str, limit: int = 5):
    if not q or len(q) < 2:
        return []

    try:
        suggestions = await get_city_suggestions_data(q, limit)
        return suggestions
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Errore nel recupero suggerimenti: {str(exc)}")
