import os

from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("OPENWEATHER_API_KEY")
BASE_URL = os.getenv("BASE_URL")
ONE_CALL_URL = os.getenv("ONE_CALL_URL")
ONE_CALL_TIMEMACHINE_URL = os.getenv("ONE_CALL_TIMEMACHINE_URL")
MAX_FORECAST_DAYS = 8

