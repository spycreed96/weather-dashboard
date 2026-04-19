import os

from dotenv import load_dotenv

load_dotenv()

WEATHER_API_KEY = os.getenv("WEATHER_API_KEY")
WEATHER_API_BASE_URL = os.getenv("WEATHER_API_BASE_URL", "https://api.weatherapi.com/v1")
WEATHER_API_LANGUAGE = os.getenv("WEATHER_API_LANGUAGE", "it")
MAX_FORECAST_DAYS = 11

