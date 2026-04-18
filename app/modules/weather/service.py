import httpx

from core.config import API_KEY, BASE_URL, MAX_FORECAST_DAYS, ONE_CALL_TIMEMACHINE_URL, ONE_CALL_URL
from modules.weather.forecast_builders import (
    build_forecast_day,
    build_forecast_days_from_lookup,
    build_hourly_forecast_lookup,
    build_hourly_forecast_points,
    build_synthetic_hourly_forecast,
    calculate_dew_point,
    calculate_precipitation_next_24h,
    get_local_datetime,
)
from modules.weather.schemas import ForecastDay, WeatherResponse


async def get_hourly_forecast_lookup(
    client: httpx.AsyncClient,
    lat: float,
    lon: float,
    timezone_offset: int,
    current_temperature: float,
    current_icon: str,
    current_description: str,
    current_timestamp: int,
) -> tuple[dict[str, dict], float]:
    forecast_url = f"{BASE_URL}/forecast?lat={lat}&lon={lon}&appid={API_KEY}&units=metric&lang=it"

    response = await client.get(forecast_url)
    response.raise_for_status()
    payload = response.json()

    entries = payload.get("list", [])

    return (
        build_hourly_forecast_lookup(
            entries,
            timezone_offset,
            current_temperature,
            current_icon,
            current_description,
            current_timestamp,
        ),
        calculate_precipitation_next_24h(entries, current_timestamp),
    )


async def get_yesterday_forecast_day(
    client: httpx.AsyncClient,
    lat: float,
    lon: float,
    timezone_offset: int,
    current_timestamp: int,
) -> ForecastDay | None:
    yesterday_timestamp = current_timestamp - 86400
    current_local_dt = get_local_datetime(current_timestamp, timezone_offset)
    yesterday_local_dt = get_local_datetime(yesterday_timestamp, timezone_offset)
    yesterday_url = (
        f"{ONE_CALL_TIMEMACHINE_URL}?lat={lat}&lon={lon}&dt={yesterday_timestamp}&appid={API_KEY}&units=metric&lang=it"
    )

    try:
        response = await client.get(yesterday_url)
        response.raise_for_status()
        payload = response.json()
    except Exception:
        return None

    data_points = payload.get("data") or payload.get("hourly") or []
    if not data_points:
        return None

    yesterday_entries = []
    yesterday_chart_entries = []
    for item in data_points:
        item_timestamp = item.get("dt")
        if not item_timestamp:
            continue

        local_dt = get_local_datetime(item_timestamp, timezone_offset)
        if local_dt.date() != yesterday_local_dt.date():
            continue

        entry = {
            "timestamp": item_timestamp,
            "sort_key": local_dt.hour + (local_dt.minute / 60),
            "hour": local_dt.hour,
            "time_label": local_dt.strftime("%H:%M"),
            "temperature": round(item.get("temp", 0)),
            "icon": item.get("weather", [{}])[0].get("icon", ""),
            "description": item.get("weather", [{}])[0].get("description", ""),
        }
        yesterday_entries.append(entry)

        if local_dt.minute == 0 and local_dt.hour % 3 == 0:
            yesterday_chart_entries.append(entry)

    if not yesterday_entries:
        return None

    closest_entry = min(
        yesterday_entries,
        key=lambda item: (
            abs(item["hour"] - current_local_dt.hour),
            abs(item["timestamp"] - yesterday_timestamp),
        ),
    )

    max_temperature = max(item["temperature"] for item in yesterday_entries)
    chart_entries = yesterday_chart_entries or yesterday_entries[::3] or yesterday_entries

    return build_forecast_day(
        yesterday_local_dt.date(),
        current_local_dt.date(),
        max_temperature,
        closest_entry["temperature"],
        closest_entry["icon"],
        closest_entry["description"],
        build_hourly_forecast_points(chart_entries),
    )


async def get_forecast_days(
    client: httpx.AsyncClient,
    lat: float,
    lon: float,
    timezone_offset: int,
    current_temperature: float,
    current_icon: str,
    current_description: str,
    current_timestamp: int,
) -> tuple[list[ForecastDay], float | None, float]:
    current_local_dt = get_local_datetime(current_timestamp, timezone_offset)
    current_sort_key = current_local_dt.hour + (current_local_dt.minute / 60)
    hourly_lookup: dict[str, dict] = {}
    precipitation_next_24h = 0.0

    try:
        hourly_lookup, precipitation_next_24h = await get_hourly_forecast_lookup(
            client,
            lat,
            lon,
            timezone_offset,
            current_temperature,
            current_icon,
            current_description,
            current_timestamp,
        )
    except Exception:
        hourly_lookup = {}

    yesterday_forecast = await get_yesterday_forecast_day(
        client,
        lat,
        lon,
        timezone_offset,
        current_timestamp,
    )

    one_call_url = (
        f"{ONE_CALL_URL}?lat={lat}&lon={lon}&exclude=minutely,hourly,alerts&appid={API_KEY}&units=metric&lang=it"
    )

    try:
        response = await client.get(one_call_url)
        response.raise_for_status()
        payload = response.json()
        current_dew_point = payload.get("current", {}).get("dew_point")
        dew_point = round(current_dew_point) if current_dew_point is not None else None

        forecast_days: list[ForecastDay] = []
        for entry in payload.get("daily", []):
            target_date = get_local_datetime(entry["dt"], timezone_offset).date()
            lookup_entry = hourly_lookup.get(target_date.isoformat(), {})
            temperature_data = entry.get("temp", {})
            weather_entry = entry.get("weather", [{}])[0]

            max_temperature = lookup_entry.get(
                "max_temperature",
                round(temperature_data.get("max", temperature_data.get("day", 0))),
            )
            current_like_temperature = lookup_entry.get(
                "current_temperature",
                round(temperature_data.get("day", temperature_data.get("max", 0))),
            )
            icon = lookup_entry.get("icon", weather_entry.get("icon", ""))
            description = lookup_entry.get("description", weather_entry.get("description", ""))
            hourly_forecast = lookup_entry.get("hourly_forecast") or build_synthetic_hourly_forecast(
                temperature_data,
                icon,
                description,
                current_temperature if target_date == current_local_dt.date() else None,
                current_sort_key if target_date == current_local_dt.date() else None,
            )

            if target_date == current_local_dt.date():
                max_temperature = max(max_temperature, round(current_temperature))
                current_like_temperature = round(current_temperature)
                icon = current_icon
                description = current_description

            forecast_days.append(
                build_forecast_day(
                    target_date,
                    current_local_dt.date(),
                    max_temperature,
                    current_like_temperature,
                    icon,
                    description,
                    hourly_forecast,
                )
            )

        if yesterday_forecast:
            return [yesterday_forecast, *forecast_days[: MAX_FORECAST_DAYS - 1]], dew_point, precipitation_next_24h

        return forecast_days[:MAX_FORECAST_DAYS], dew_point, precipitation_next_24h
    except Exception:
        forecast_days = build_forecast_days_from_lookup(hourly_lookup, current_local_dt.date())

        if yesterday_forecast:
            filtered_days = [day for day in forecast_days if day.date != yesterday_forecast.date]
            return [yesterday_forecast, *filtered_days[: MAX_FORECAST_DAYS - 1]], None, precipitation_next_24h

        return forecast_days[:MAX_FORECAST_DAYS], None, precipitation_next_24h


async def get_country_metadata(client: httpx.AsyncClient, country_code: str) -> tuple[str, str]:
    country_name = country_code.upper()
    continent = ""

    if not country_code:
        return country_name, continent

    restcountries_url = f"https://restcountries.com/v3.1/alpha/{country_code}"

    try:
        response = await client.get(restcountries_url, timeout=10.0)
        response.raise_for_status()
        payload = response.json()
        country_data = payload[0] if isinstance(payload, list) and payload else payload

        country_name = country_data.get("name", {}).get("common", country_name)
        continent = country_data.get("region", continent)
    except Exception:
        pass

    return country_name, continent


async def get_state_metadata(client: httpx.AsyncClient, lat: float, lon: float) -> str:
    reverse_geo_url = (
        f"https://api.openweathermap.org/geo/1.0/reverse?lat={lat}&lon={lon}&limit=1&appid={API_KEY}"
    )

    try:
        response = await client.get(reverse_geo_url, timeout=10.0)
        response.raise_for_status()
        payload = response.json()

        if payload:
            return payload[0].get("state", "")
    except Exception:
        pass

    return ""


async def get_weather_data(city: str = "Catanzaro", country: str = "") -> WeatherResponse:
    location_query = city if not country else f"{city},{country}"
    url = f"{BASE_URL}/weather?q={location_query}&appid={API_KEY}&units=metric&lang=it"

    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        response.raise_for_status()
        data = response.json()
        country_code = data.get("sys", {}).get("country", country.upper())
        country_name, continent = await get_country_metadata(client, country_code)
        lat = data["coord"]["lat"]
        lon = data["coord"]["lon"]
        timezone_offset = data.get("timezone", 0)
        current_timestamp = data.get("dt", 0)
        current_temperature = round(data["main"]["temp"])
        current_icon = data["weather"][0]["icon"]
        current_description = data["weather"][0]["description"]
        state = await get_state_metadata(client, lat, lon)

        air_url = f"https://api.openweathermap.org/data/2.5/air_pollution?lat={lat}&lon={lon}&appid={API_KEY}"
        try:
            air_response = await client.get(air_url)
            air_response.raise_for_status()
            air_data = air_response.json()
            aqi = air_data["list"][0]["main"]["aqi"]
            air_quality = ["Buona", "Accettabile", "Moderata", "Cattiva", "Molto cattiva"][aqi - 1] if 1 <= aqi <= 5 else "N/A"
        except Exception:
            air_quality = "N/A"

        try:
            forecast_days, dew_point, precipitation_next_24h = await get_forecast_days(
                client,
                lat,
                lon,
                timezone_offset,
                current_temperature,
                current_icon,
                current_description,
                current_timestamp,
            )
        except Exception:
            forecast_days = []
            dew_point = None
            precipitation_next_24h = 0.0

    if dew_point is None:
        dew_point = calculate_dew_point(current_temperature, data["main"]["humidity"])

    return WeatherResponse(
        name=data["name"],
        country=country_code,
        country_name=country_name,
        continent=continent,
        state=state,
        latitude=lat,
        longitude=lon,
        temperature=current_temperature,
        description=data["weather"][0]["description"],
        humidity=data["main"]["humidity"],
        wind_speed=round(data["wind"]["speed"] * 3.6, 1),
        icon=data["weather"][0]["icon"],
        cloudiness=data.get("clouds", {}).get("all", 0),
        feels_like=round(data["main"]["feels_like"]),
        dew_point=dew_point,
        visibility=round(data.get("visibility", 10000) / 1000),
        pressure=data["main"]["pressure"],
        air_quality=air_quality,
        precipitation_next_24h=precipitation_next_24h,
        forecast_days=forecast_days,
    )


async def get_city_suggestions_data(query: str, limit: int = 5) -> list:
    geo_url = f"https://api.openweathermap.org/geo/1.0/direct?q={query}&limit={limit}&appid={API_KEY}"

    async with httpx.AsyncClient() as client:
        response = await client.get(geo_url)
        response.raise_for_status()
        data = response.json()

    suggestions = []
    for item in data:
        name = item.get("name", "")
        state = item.get("state", "")
        country = item.get("country", "")
        if name:
            suggestions.append(
                {
                    "name": name,
                    "region_country": f"{state}, {country}" if state else country,
                    "full_name": f"{name},{country}",
                }
            )

    return suggestions
