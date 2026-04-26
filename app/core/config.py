import os

from dotenv import load_dotenv

load_dotenv()

APP_TITLE = "Weather Dashboard API"
APP_VERSION = "1.0.0"


def _normalize_app_env(value: str) -> str:
    normalized = value.strip().lower()
    aliases = {
        "dev": "development",
        "prod": "production",
    }
    return aliases.get(normalized, normalized)


def _parse_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]

WEATHER_API_KEY = os.getenv("WEATHER_API_KEY")
WEATHER_API_BASE_URL = os.getenv("WEATHER_API_BASE_URL", "https://api.weatherapi.com/v1")
WEATHER_API_LANGUAGE = os.getenv("WEATHER_API_LANGUAGE", "it")
MAX_FORECAST_DAYS = 11
APP_ENV = _normalize_app_env(os.getenv("APP_ENV", "development"))

DEFAULT_DEV_CORS_ALLOWED_ORIGINS = [
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

_cors_allowed_origins = os.getenv("CORS_ALLOWED_ORIGINS")
if _cors_allowed_origins is None:
    CORS_ALLOWED_ORIGINS = (
        DEFAULT_DEV_CORS_ALLOWED_ORIGINS.copy() if APP_ENV == "development" else []
    )
else:
    CORS_ALLOWED_ORIGINS = _parse_csv(_cors_allowed_origins)

