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
    icon: str
    feels_like: float
    dew_point: float
    visibility: int
    pressure: int
    air_quality: str
    forecast_days: list[ForecastDay] = Field(default_factory=list)
