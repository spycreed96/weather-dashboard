import { htmlToElement } from "../../../shared/utils/dom.js";
import { renderDetailInlineTemperature } from "../utils/weather-formatters.js";

export function renderWeatherDetails() {
  return `
    <div class="weather-details-grid">
      <div class="detail-item">
        <span>Qualità dell'aria</span>
        <strong id="air-quality">--</strong>
      </div>
      <div class="detail-item">
        <span>Vento</span>
        <strong id="wind">-- km/h</strong>
      </div>
      <div class="detail-item">
        <span>Umidità</span>
        <strong id="humidity">--%</strong>
      </div>
      <div class="detail-item">
        <span>Punto di Rugiada</span>
        <strong id="dew-point" aria-label="--°">${renderDetailInlineTemperature()}</strong>
      </div>
      <div class="detail-item">
        <span>Visibilità</span>
        <strong id="visibility">-- km</strong>
      </div>
      <div class="detail-item">
        <span>Pressione</span>
        <strong id="pressure">-- hPa</strong>
      </div>
    </div>
  `;
}

export function createHistoryItem({ cityKey, cityName, historyQuery, iconMarkup, temperatureLabel, temperatureMarkup, rawTemperature }) {
  const item = htmlToElement(`
    <div class="weather-history-item" data-city-key="${cityKey}" data-city="${cityName}" data-query="${historyQuery}">
      <div class="history-city-name">${cityName}</div>
      <div class="history-icon">${iconMarkup}</div>
      <div class="history-temperature" data-celsius="${rawTemperature}" aria-label="${temperatureLabel}">${temperatureMarkup}</div>
      <button type="button" class="history-menu" aria-haspopup="true" aria-expanded="false" aria-label="Apri menu percorso">...</button>
    </div>
  `);

  return {
    item,
    menuButton: item.querySelector(".history-menu"),
  };
}
