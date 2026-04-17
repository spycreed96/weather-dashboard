import os

from pydantic import BaseSettings


class Settings(BaseSettings):
    openweather_api_key: str = os.getenv("OPENWEATHER_API_KEY", "")
    openweather_base_url: str = "https://api.openweathermap.org/data/2.5/weather"

    class Config:
        env_file = ".env"


settings = Settings()
