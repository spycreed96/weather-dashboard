import httpx

POLLEN_LABELS = {
    "Hazel": "Nocciolo",
    "Alder": "Ontano",
    "Birch": "Betulla",
    "Oak": "Quercia",
    "Grass": "Graminacee",
    "Mugwort": "Artemisia",
    "Ragweed": "Ambrosia",
    "alder_pollen": "Ontano",
    "birch_pollen": "Betulla",
    "grass_pollen": "Graminacee",
    "mugwort_pollen": "Artemisia",
    "olive_pollen": "Olivo",
    "ragweed_pollen": "Ambrosia",
}


def get_pollen_level(pollen_value: float | None) -> str | None:
    if pollen_value is None:
        return None

    if pollen_value <= 0:
        return "Assente"

    if pollen_value <= 20:
        return "Basso"

    if pollen_value <= 100:
        return "Moderata"

    if pollen_value <= 300:
        return "Alta"

    return "Molto alta"


def normalize_pollen_index(pollen_value: float | None) -> int | None:
    if pollen_value is None:
        return None

    if pollen_value <= 0:
        return 0

    if pollen_value <= 20:
        return max(1, round((pollen_value / 20) * 25))

    if pollen_value <= 100:
        return min(50, 25 + round(((pollen_value - 20) / 80) * 25))

    if pollen_value <= 300:
        return min(75, 50 + round(((pollen_value - 100) / 200) * 25))

    capped_value = min(pollen_value, 600)
    return min(100, 75 + round(((capped_value - 300) / 300) * 25))


def build_pollen_metrics(current_payload: dict | None) -> dict:
    if not current_payload:
        return {
            "pollen_index": None,
            "pollen_primary_allergy": None,
            "pollen_level": None,
        }

    candidates = []
    for field_name, label in POLLEN_LABELS.items():
        value = current_payload.get(field_name)
        if value is None:
            value = current_payload.get(field_name.lower())
        if value is None:
            continue

        candidates.append(
            {
                "label": label,
                "value": max(float(value), 0.0),
            }
        )

    primary = max(candidates, key=lambda item: item["value"], default=None)
    if primary is None:
        return {
            "pollen_index": None,
            "pollen_primary_allergy": None,
            "pollen_level": None,
        }

    return {
        "pollen_index": normalize_pollen_index(primary["value"]),
        "pollen_primary_allergy": primary["label"] if primary["value"] > 0 else None,
        "pollen_level": get_pollen_level(primary["value"]),
    }


async def get_pollen_metrics(
    client: httpx.AsyncClient,
    lat: float | None,
    lon: float | None,
    current_payload: dict | None = None,
) -> dict:
    initial_metrics = build_pollen_metrics(current_payload)
    if initial_metrics["pollen_index"] is not None:
        return initial_metrics

    if lat is None or lon is None:
        return initial_metrics

    pollen_url = (
        "https://air-quality-api.open-meteo.com/v1/air-quality"
        f"?latitude={lat}&longitude={lon}"
        "&current=alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen"
        "&domains=cams_europe&timezone=auto&forecast_days=1"
    )

    try:
        response = await client.get(pollen_url, timeout=10.0)
        response.raise_for_status()
        payload = response.json()
        return build_pollen_metrics(payload.get("current"))
    except Exception:
        return initial_metrics