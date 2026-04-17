from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from modules.weather.router import router as weather_router

app = FastAPI(title="Weather Dashboard API", version="1.0.0")
frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
 
# Abilita CORS per permettere chiamate dal frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In produzione, limita a domini specifici
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Includi le route
app.include_router(weather_router, prefix="/api", tags=["weather"])

if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)