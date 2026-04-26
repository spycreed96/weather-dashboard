from __future__ import annotations

import json
import os
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
DOTENV_PATH = ROOT_DIR / ".env"
CONFIG_PATH = ROOT_DIR / "frontend" / "config.js"
DEFAULT_API_BASE_URL = "/api"


def load_dotenv_value(path: Path, key: str) -> str | None:
    if not path.exists():
        return None

    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue

        current_key, raw_value = stripped.split("=", 1)
        if current_key.strip() != key:
            continue

        value = raw_value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        return value

    return None


def resolve_api_base_url() -> str:
    env_value = os.getenv("FRONTEND_API_BASE_URL")
    dotenv_value = load_dotenv_value(DOTENV_PATH, "FRONTEND_API_BASE_URL")
    configured_value = env_value if env_value is not None else dotenv_value
    normalized_value = (configured_value or "").strip()
    return normalized_value or DEFAULT_API_BASE_URL


def main() -> None:
    api_base_url = resolve_api_base_url()
    config_json = json.dumps({"apiBaseUrl": api_base_url}, indent=2)
    contents = f"window.__WEATHER_DASHBOARD_CONFIG__ = Object.freeze({config_json});\n"
    CONFIG_PATH.write_text(contents, encoding="utf-8")
    print(f"Wrote {CONFIG_PATH} with FRONTEND_API_BASE_URL={api_base_url!r}")


if __name__ == "__main__":
    main()
