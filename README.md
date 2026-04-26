# Weather Dashboard

Weather Dashboard AI è una web app meteo composta da:

- un backend FastAPI in `app/`
- un frontend statico in `frontend/`
- integrazioni esterne verso WeatherAPI, Open-Meteo e Rest Countries

L'architettura attuale è pensata per un deploy single-origin: il backend espone le API sotto `/api` e serve anche il frontend statico dalla root `/`.

## Struttura del repository

- `app/`: backend FastAPI e logica meteo
- `frontend/`: HTML, CSS e JavaScript serviti come file statici
- `docs/deployment.md`: guida completa al deployment
- `.env.example`: variabili ambiente richieste
- `requirements.txt`: dipendenze Python usate dal progetto

## Requisiti minimi

- Python allineato al venv locale del progetto (`3.14.3` al momento della stesura)
- una chiave valida per `WEATHER_API_KEY`
- accesso internet in uscita dal server verso i provider meteo

Node.js non è richiesto in produzione con la configurazione attuale, perche il frontend non ha una build pipeline dedicata.

## Avvio locale rapido

1. Crea o attiva un ambiente virtuale Python.
2. Installa le dipendenze con `pip install -r requirements.txt`.
3. Crea `.env` partendo da `.env.example`.
4. Avvia il backend con:

```powershell
python -m uvicorn main:app --app-dir app --host 127.0.0.1 --port 8000
```

5. Apri `http://127.0.0.1:8000`.

Il comando sopra è quello raccomandato anche in deploy. Non usare `uvicorn app.main:app` dalla root del repository: con la struttura attuale degli import puo fallire in fase di bootstrap.

## Smoke test

Per un controllo rapido del backend e del mount del frontend puoi eseguire:

```powershell
python -m unittest discover -s tests -v
```

## Endpoint utili

- `GET /api/weather?city=Rome`
- `GET /api/cities?q=Rom&limit=5`

Se `WEATHER_API_KEY` non è configurata, le route API rispondono con `503`.

## Note operative

- Il frontend usa path relativi verso `/api`, quindi funziona al meglio quando frontend e backend sono serviti dallo stesso dominio.
- Se `APP_ENV=production` e frontend e backend restano sullo stesso origin, il backend non abilita CORS.
- Se separi frontend e backend su origin diversi, imposta `CORS_ALLOWED_ORIGINS` con una lista separata da virgole.
- `frontend/package.json` contiene solo un server statico di preview. Non è il percorso consigliato per il deploy dell'app completa.
- Il browser scarica alcune librerie da CDN esterni (`unpkg.com` e `cdn.jsdelivr.net`).

## Deployment

La procedura completa è in [docs/deployment.md](docs/deployment.md).
