from datetime import datetime

import httpx

from core.config import MAX_FORECAST_DAYS
from modules.weather.forecast_builders import calculate_dew_point
from modules.weather.open_meteo_forecast import build_open_meteo_forecast_days, fetch_open_meteo_forecast
from modules.weather.open_meteo_pollen import get_pollen_metrics
from modules.weather.schemas import WeatherResponse
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


async def get_weather_data(city: str = "Catanzaro", country: str = "") -> WeatherResponse:
    ensure_weather_api_configured()
    location_query = city if not country else f"{city},{country}"

    async with httpx.AsyncClient() as client:
        forecast_payload = await fetch_weatherapi_forecast(client, location_query)
        location = forecast_payload.get("location", {})
        current = forecast_payload.get("current", {})
        forecast_section = forecast_payload.get("forecast", {})
        forecast_day_payloads = forecast_section.get("forecastday", [])
        current_local_dt = parse_weatherapi_datetime(location.get("localtime")) or datetime.utcnow()
        current_epoch = current.get("last_updated_epoch") or location.get("localtime_epoch") or int(current_local_dt.timestamp())
        coordinates_query = f"{location.get('lat')},{location.get('lon')}" if location.get("lat") is not None and location.get("lon") is not None else location_query
        country_code, country_name, continent = await get_country_metadata(client, location.get("country", ""))
        state = location.get("region", "")

        forecast_days, dew_point, precipitation_next_24h, pressure_tomorrow, astronomy_context = build_forecast_days(
            forecast_day_payloads,
            current,
            current_local_dt,
            current_epoch,
        )

        if len(forecast_days) < MAX_FORECAST_DAYS:
            try:
                open_meteo_payload = await fetch_open_meteo_forecast(
                    client,
                    location.get("lat"),
                    location.get("lon"),
                    location.get("tz_id") or "auto",
                )
                extra_forecast_days = build_open_meteo_forecast_days(
                    open_meteo_payload,
                    current_local_dt,
                    {day.date for day in forecast_days},
                )
                forecast_days = [*forecast_days, *extra_forecast_days][:MAX_FORECAST_DAYS]
            except Exception:
                pass

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


async def get_city_suggestions_data(query: str, limit: int = 5) -> list:
    ensure_weather_api_configured()

    async with httpx.AsyncClient() as client:
        return await get_weatherapi_city_suggestions(client, query, limit)
