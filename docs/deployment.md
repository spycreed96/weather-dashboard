# Deployment

## Obiettivo

Questa guida documenta il deploy dell'app nella sua forma attuale, senza introdurre una build frontend separata o modifiche al codice. Il percorso consigliato è:

- un processo Uvicorn che serve API e frontend
- un reverse proxy davanti all'app
- una configurazione `.env` sul server

## Cosa viene deployato

- Entrypoint backend: `app/main.py`
- API FastAPI: `/api/weather` e `/api/cities`
- Frontend statico: cartella `frontend/`, montata dal backend con `StaticFiles`

Non esiste una pipeline di build frontend. In produzione il backend serve direttamente i file presenti in `frontend/`.

## Prerequisiti

- Python allineato alla versione usata localmente (`3.14.3` al momento della stesura) oppure una versione testata esplicitamente prima del rilascio
- accesso a una chiave WeatherAPI
- accesso internet in uscita dal server verso questi host:
- `api.weatherapi.com`
- `api.open-meteo.com`
- `air-quality-api.open-meteo.com`
- `restcountries.com`

Accessi richiesti dal browser dei client:

- `unpkg.com`
- `cdn.jsdelivr.net`
- `tile.openstreetmap.org`
- `openweathermap.org`

## Variabili ambiente

Usa `.env.example` come base.

| Variabile | Obbligatoria | Default | Note |
| --- | --- | --- | --- |
| `APP_ENV` | no | `development` | Accetta anche `dev` e `prod`; in produzione usa `production` |
| `WEATHER_API_KEY` | si | nessuno | Necessaria per tutte le chiamate API dell'app |
| `WEATHER_API_BASE_URL` | no | `https://api.weatherapi.com/v1` | Override del provider principale |
| `WEATHER_API_LANGUAGE` | no | `it` | Lingua passata a WeatherAPI |
| `FRONTEND_API_BASE_URL` | no | `/api` | Usata dal frontend statico separato e dallo script `scripts/generate_frontend_config.py`; puoi impostarla a `https://your-app.onrender.com/api` |
| `CORS_ALLOWED_ORIGINS` | no | automatico in `development`, vuoto in `production` | Lista separata da virgole da usare solo se frontend e backend sono su origin diversi |

## Comando di avvio corretto

Avvia l'app dalla root del repository con:

```bash
python -m uvicorn main:app --app-dir app --host 127.0.0.1 --port 8000
```

Questo dettaglio è importante: la struttura attuale degli import non rende affidabile `uvicorn app.main:app` eseguito dalla root.

## Procedura consigliata su Linux

I percorsi qui sotto usano `/srv/weather-dashboard-AI` come esempio. Adattali al tuo server.

### 1. Preparazione directory

```bash
sudo mkdir -p /srv/weather-dashboard-AI
sudo chown $USER:$USER /srv/weather-dashboard-AI
git clone <REPO_URL> /srv/weather-dashboard-AI
cd /srv/weather-dashboard-AI
```

### 2. Ambiente Python

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 3. Configurazione `.env`

```bash
cp .env.example .env
```

Poi imposta almeno:

```dotenv
APP_ENV=production
WEATHER_API_KEY=replace-with-your-key
```

Se frontend e backend restano sullo stesso origin, puoi lasciare `CORS_ALLOWED_ORIGINS` vuota.
Se invece il frontend vive su un origin separato, aggiungi per esempio:

```dotenv
CORS_ALLOWED_ORIGINS=https://weather.example.com,https://www.weather.example.com
```

Se pubblichi il frontend su GitHub Pages, imposta anche la repository variable `FRONTEND_API_BASE_URL` in GitHub Actions con il backend pubblico, per esempio:

```dotenv
FRONTEND_API_BASE_URL=https://your-app.onrender.com/api
```

### 4. Smoke test manuale

```bash
. .venv/bin/activate
python -m uvicorn main:app --app-dir app --host 127.0.0.1 --port 8000
```

Verifiche minime:

- `curl -I http://127.0.0.1:8000/`
- `curl "http://127.0.0.1:8000/api/cities?q=Rom&limit=3"`
- `curl "http://127.0.0.1:8000/api/weather?city=Rome"`

Atteso:

- `/` risponde `200`
- `/api/cities` risponde `200` oppure un errore del provider se la chiave o la rete non sono corrette
- `/api/weather` risponde `200` oppure `503` se `WEATHER_API_KEY` manca

### 5. Service `systemd`

Crea `/etc/systemd/system/weather-dashboard.service`:

```ini
[Unit]
Description=Weather Dashboard FastAPI service
After=network.target

[Service]
Type=simple
User=your-user
Group=your-user
WorkingDirectory=/srv/weather-dashboard-AI
EnvironmentFile=/srv/weather-dashboard-AI/.env
ExecStart=/srv/weather-dashboard-AI/.venv/bin/python -m uvicorn main:app --app-dir app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Poi abilita il servizio:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now weather-dashboard
sudo systemctl status weather-dashboard
```

Sostituisci `your-user` con lo stesso utente che possiede la cartella `/srv/weather-dashboard-AI`.

### 6. Reverse proxy Nginx

Configura un virtual host come questo:

```nginx
server {
    listen 80;
    server_name weather.example.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Poi ricarica Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Per HTTPS puoi aggiungere Certbot o il tuo terminatore TLS preferito davanti allo stesso upstream.

## Aggiornare il deploy

Per pubblicare una nuova versione:

```bash
cd /srv/weather-dashboard-AI
git pull
. .venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart weather-dashboard
sudo systemctl status weather-dashboard
```

## Checklist finale

- `.env` presente sul server
- `WEATHER_API_KEY` valorizzata
- `weather-dashboard` attivo in `systemd`
- reverse proxy configurato verso `127.0.0.1:8000`
- test su `/`, `/api/cities` e `/api/weather` eseguiti con esito atteso

## Limiti noti della versione attuale

- Non esiste un endpoint dedicato `/health`.
- Il frontend dipende da CDN esterni per alcune librerie.
- Le tile della mappa arrivano da OpenStreetMap lato browser.
- Se in `production` non imposti `CORS_ALLOWED_ORIGINS`, il backend non abilita CORS.
- Se in futuro separi frontend e backend su domini diversi, puoi impostare `FRONTEND_API_BASE_URL` per puntare il frontend al backend pubblico, ma resta comunque necessario configurare `CORS_ALLOWED_ORIGINS`.
