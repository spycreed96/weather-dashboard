import { renderDetailInlineTemperature, renderPrimaryTemperature } from "../utils/weather-formatters.js";
import { renderWeatherDetails } from "./weather-details.js";

export function renderWeatherCard() {
  return `
    <div class="weather-layout">
        <section class="weather-card">
          <div class="weather-header">
            <div class="weather-header-content">
              <h2>Meteo Attuale</h2>
              <p class="current-time" id="current-time">--:--</p>
            </div>
          </div>

        <div class="weather-main">
          <div class="weather-icon" id="weather-icon"></div>
          <div class="temperature" id="temperature" aria-label="--°C">${renderPrimaryTemperature()}</div>
          <div class="weather-main-column">
            <p class="weather-summary" id="weather-summary">--</p>
            <p class="weather-feels-like">Percepita <strong id="feels-like" aria-label="--°">${renderDetailInlineTemperature()}</strong></p>
          </div>
        </div>

        ${renderWeatherDetails()}
      </section>

      <aside class="map-card">
        <div class="map-card-header">
          <h2>Mappa Citta</h2>
          <p id="map-copy" class="map-card-copy">Vista geografica centrata sulla citta corrente</p>
        </div>
        <div id="city-map" class="city-map" aria-label="Mappa della citta corrente"></div>
      </aside>
    </div>
  `;
}
