from pydantic import BaseModel, Field


class HourlyForecastPoint(BaseModel):
    time_label: str = Field(min_length=1)
    temperature: float
    icon: str
    description: str
    is_now: bool = False


class ForecastDay(BaseModel):
    date: str
    day_of_month: int
    label: str
    max_temperature: float
    current_temperature: float
    icon: str
    description: str
    hourly_forecast: list[HourlyForecastPoint] = Field(default_factory=list)


class WeatherResponse(BaseModel):
    name: str
    country: str
    country_name: str
    continent: str
    state: str
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    temperature: float
    description: str
    humidity: int = Field(ge=0, le=100)
    wind_speed: float = Field(ge=0)
    wind_gust: float | None = None
    wind_direction: int | None = None
    icon: str
    cloudiness: int = Field(ge=0, le=100)
    feels_like: float
    dew_point: float
    visibility: int = Field(ge=0)
    pressure: int = Field(ge=0)
    pressure_tomorrow: int | None = None
    uv_index: float | None = None
    uv_index_tomorrow: float | None = None
    pollen_index: int | None = None
    pollen_primary_allergy: str | None = None
    pollen_level: str | None = None
    sunrise_time: str | None = None
    sunset_time: str | None = None
    sun_visibility_minutes: int | None = None
    sun_progress: float | None = None
    moonrise_time: str | None = None
    moonset_time: str | None = None
    moon_visibility_minutes: int | None = None
    moon_phase_label: str | None = None
    moon_illumination: int | None = None
    next_full_moon_date: str | None = None
    moon_progress: float | None = None
    air_quality: str
    air_quality_index: int | None = None
    air_quality_primary_pollutant: str | None = None
    air_quality_primary_pollutant_value: float | None = None
    air_quality_primary_pollutant_unit: str | None = None
    precipitation_next_24h: float = Field(ge=0)
    forecast_days: list[ForecastDay] = Field(default_factory=list)


class CitySuggestion(BaseModel):
    name: str = Field(min_length=1)
    region_country: str = ""
    full_name: str = Field(min_length=1)
