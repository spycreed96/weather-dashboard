import logging
from typing import Any

import httpx

from core.config import (
    MAX_FORECAST_DAYS,
    WEATHER_API_BASE_URL,
    WEATHER_API_KEY,
    WEATHER_API_LANGUAGE,
)
from modules.weather.constants import DEFAULT_LOCATION_COUNTRY
from modules.weather.schemas import CitySuggestionPayload, WeatherApiSearchResult

logger = logging.getLogger(__name__)


def ensure_weather_api_configured() -> None:
    """Raise if the WeatherAPI key is not configured."""
    if not WEATHER_API_KEY:
        raise RuntimeError("Configura WEATHER_API_KEY nel file .env per usare WeatherAPI come sorgente principale.")


def has_explicit_location_context(query: str) -> bool:
    """Return whether a query already includes a location qualifier."""
    return "," in query


def build_country_biased_query(query: str, country_name: str = DEFAULT_LOCATION_COUNTRY) -> str:
    """Append a country name to bias ambiguous WeatherAPI searches."""
    return f"{query}, {country_name}"


def should_retry_without_optional_features(response: httpx.Response) -> bool:
    """Detect WeatherAPI responses caused by unsupported optional features."""
    try:
        payload = response.json()
    except ValueError:
        return False

    return payload.get("error", {}).get("code") == 2009


async def fetch_weatherapi_forecast_raw(client: httpx.AsyncClient, query: str) -> dict[str, Any]:
    """Fetch raw WeatherAPI forecast data with optional-feature fallbacks."""
    ensure_weather_api_configured()

    base_params = {
        "key": WEATHER_API_KEY,
        "q": query,
        "alerts": "no",
        "lang": WEATHER_API_LANGUAGE,
    }
    days_variants = tuple(dict.fromkeys((MAX_FORECAST_DAYS, min(MAX_FORECAST_DAYS, 3), 1)))
    optional_variants = (
        {"aqi": "yes", "pollen": "yes"},
        {"aqi": "yes"},
        {"pollen": "yes"},
        {},
    )
    last_error: httpx.HTTPStatusError | None = None

    for days in days_variants:
        for optional_params in optional_variants:
            response = await client.get(
                f"{WEATHER_API_BASE_URL}/forecast.json",
                params={**base_params, "days": days, **optional_params},
                timeout=15.0,
            )
            try:
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as exc:
                if should_retry_without_optional_features(exc.response):
                    last_error = exc
                    continue

                raise

    if last_error is not None:
        raise last_error

    raise RuntimeError("Impossibile recuperare il forecast da WeatherAPI.")


async def fetch_weatherapi_forecast(client: httpx.AsyncClient, query: str) -> dict[str, Any]:
    """Fetch forecast data, retrying ambiguous queries with an Italy bias."""
    forecast_payload = await fetch_weatherapi_forecast_raw(client, query)

    if has_explicit_location_context(query):
        return forecast_payload

    if forecast_payload.get("location", {}).get("country") == DEFAULT_LOCATION_COUNTRY:
        return forecast_payload

    try:
        italy_biased_payload = await fetch_weatherapi_forecast_raw(client, build_country_biased_query(query))
    except Exception:
        logger.debug("Italy-biased WeatherAPI forecast lookup failed for %r", query, exc_info=True)
        return forecast_payload

    if italy_biased_payload.get("location", {}).get("country") == DEFAULT_LOCATION_COUNTRY:
        return italy_biased_payload

    return forecast_payload


async def fetch_weatherapi_search_results(client: httpx.AsyncClient, query: str) -> list[WeatherApiSearchResult]:
    """Fetch raw city search results from WeatherAPI."""
    response = await client.get(
        f"{WEATHER_API_BASE_URL}/search.json",
        params={
            "key": WEATHER_API_KEY,
            "q": query,
        },
        timeout=15.0,
    )
    response.raise_for_status()
    payload = response.json()
    return payload if isinstance(payload, list) else []


async def get_weatherapi_city_suggestions(
    client: httpx.AsyncClient,
    query: str,
    limit: int = 5,
) -> list[CitySuggestionPayload]:
    """Build deduplicated city suggestions from WeatherAPI search results."""
    primary_results = await fetch_weatherapi_search_results(client, query)
    italy_biased_results: list[WeatherApiSearchResult] = []

    if not has_explicit_location_context(query):
        try:
            italy_biased_results = await fetch_weatherapi_search_results(client, build_country_biased_query(query))
        except Exception:
            logger.debug("Italy-biased WeatherAPI search lookup failed for %r", query, exc_info=True)
            italy_biased_results = []

    suggestions: list[CitySuggestionPayload] = []
    seen_full_names: set[str] = set()
    for item in [*italy_biased_results, *primary_results]:
        name = item.get("name", "")
        state = item.get("region", "")
        country_name = item.get("country", "")
        lat = item.get("lat")
        lon = item.get("lon")
        full_name = f"{lat},{lon}" if lat is not None and lon is not None else ", ".join(
            part for part in (name, state, country_name) if part
        )
        if not name or full_name in seen_full_names:
            continue

        seen_full_names.add(full_name)
        suggestions.append(
            {
                "name": name,
                "region_country": f"{state}, {country_name}" if state else country_name,
                "full_name": full_name,
            }
        )

        if len(suggestions) >= limit:
            break

    return suggestions
