import { renderForecastChart, renderForecastItems } from "./forecast-list.js";

const FORECAST_TAB_LABELS = [
  "Panoramica",
  "Precipitazioni",
  "Vento",
  "Qualita' dell'aria",
  "Umidita'",
  "Nuvolosita'",
  "...",
];

export function renderForecastPanel() {
  return `
    <section class="forecast-panel" aria-labelledby="forecast-panel-title">
      <div class="forecast-toolbar">
        <div class="forecast-toolbar-scroll">
          <div class="feature-tabs" aria-label="Panoramica forecast">
            <span class="forecast-toolbar-label">Ogni ora</span>
            ${FORECAST_TAB_LABELS.map(
              (label, index) => `<span class="feature-tab${index === 0 ? " is-active" : ""}">${label}</span>`,
            ).join("")}
          </div>
        </div>

        <div class="forecast-view-toggle" aria-hidden="true">
          <span class="forecast-view-pill is-active">Grafico</span>
          <span class="forecast-view-pill">Elenco</span>
        </div>
      </div>

      <div class="forecast-carousel">
        <button type="button" class="forecast-nav-btn" id="forecast-prev" aria-label="Scorri i giorni precedenti">&#8249;</button>
        <div id="daily-forecast-list" class="daily-forecast-list" aria-live="polite">${renderForecastItems([], "", "celsius")}</div>
        <button type="button" class="forecast-nav-btn" id="forecast-next" aria-label="Scorri i giorni successivi">&#8250;</button>
      </div>

      <div class="forecast-panel-header">
        <div>
          <h3 id="forecast-panel-title">Panoramica</h3>
          <p class="forecast-panel-copy">Panello orario con vista termica, trend giornaliero e contesto astronomico.</p>
        </div>

        <div class="forecast-panel-meta" aria-hidden="true">
          <span class="forecast-panel-meta-label">Percepita</span>
          <span class="forecast-panel-meta-switch"></span>
        </div>
      </div>

      <div id="forecast-chart" class="forecast-chart" aria-live="polite">${renderForecastChart(null, "celsius")}</div>
    </section>
  `;
}