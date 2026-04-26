WEEKDAY_LABELS = (
    "lunedi",
    "martedi",
    "mercoledi",
    "giovedi",
    "venerdi",
    "sabato",
    "domenica",
)

AQI_LABELS = {
    1: "Buona",
    2: "Accettabile",
    3: "Moderata",
    4: "Cattiva",
    5: "Molto cattiva",
    6: "Molto cattiva",
}

AQI_FALLBACK_INDEX = {
    1: 25,
    2: 75,
    3: 125,
    4: 175,
    5: 250,
    6: 300,
}

PM25_BREAKPOINTS = (
    (0.0, 12.0, 0, 50),
    (12.1, 35.4, 51, 100),
    (35.5, 55.4, 101, 150),
    (55.5, 150.4, 151, 200),
    (150.5, 250.4, 201, 300),
    (250.5, 350.4, 301, 400),
    (350.5, 500.4, 401, 500),
)

PM10_BREAKPOINTS = (
    (0.0, 54.0, 0, 50),
    (55.0, 154.0, 51, 100),
    (155.0, 254.0, 101, 150),
    (255.0, 354.0, 151, 200),
    (355.0, 424.0, 201, 300),
    (425.0, 504.0, 301, 400),
    (505.0, 604.0, 401, 500),
)

O3_BREAKPOINTS = (
    (0.000, 0.054, 0, 50),
    (0.055, 0.070, 51, 100),
    (0.071, 0.085, 101, 150),
    (0.086, 0.105, 151, 200),
    (0.106, 0.200, 201, 300),
)

MOON_PHASE_LABELS = {
    "New Moon": "Luna nuova",
    "Waxing Crescent": "Falce crescente",
    "First Quarter": "Primo quarto",
    "Waxing Gibbous": "Gibbosa crescente",
    "Full Moon": "Luna piena",
    "Waning Gibbous": "Gibbosa calante",
    "Last Quarter": "Ultimo quarto",
    "Waning Crescent": "Falce calante",
}

SYNODIC_MONTH_DAYS = 29.530588853
DEFAULT_LOCATION_COUNTRY = "Italy"
DEFAULT_CITY = "Catanzaro"
MAX_LOCATION_QUERY_LENGTH = 80
MIN_CITY_SUGGESTION_QUERY_LENGTH = 3
MAX_CITY_SUGGESTION_LIMIT = 10
