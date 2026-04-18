from pydantic import BaseModel, Field


class HourlyForecastPoint(BaseModel):
    time_label: str
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
    latitude: float
    longitude: float
    temperature: float
    description: str
    humidity: int
    wind_speed: float
    wind_gust: float | None = None
    wind_direction: int | None = None
    icon: str
    cloudiness: int
    feels_like: float
    dew_point: float
    visibility: int
    pressure: int
    pressure_tomorrow: int | None = None
    pollen_index: int | None = None
    pollen_primary_allergy: str | None = None
    pollen_level: str | None = None
    moonrise_time: str | None = None
    moonset_time: str | None = None
    moon_visibility_minutes: int | None = None
    moon_phase_label: str | None = None
    moon_progress: float | None = None
    air_quality: str
    air_quality_index: int | None = None
    air_quality_primary_pollutant: str | None = None
    air_quality_primary_pollutant_value: float | None = None
    air_quality_primary_pollutant_unit: str | None = None
    precipitation_next_24h: float
    forecast_days: list[ForecastDay] = Field(default_factory=list)
