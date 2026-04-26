import { renderForecastChart, renderForecastItems } from "./forecast-list.js";

const FORECAST_TABS = [
  { id: "overview", label: "Panoramica", enabled: true },
  { id: "precipitation", label: "Precipitazioni", enabled: true },
  { id: "wind", label: "Vento", enabled: true },
];

export function renderForecastPanel() {
  return `
    <section class="forecast-panel" aria-labelledby="forecast-panel-title">
      <div class="forecast-toolbar">
        <div class="forecast-toolbar-scroll">
          <div class="feature-tabs" aria-label="Sezioni forecast">
            <span class="forecast-toolbar-label">Ogni ora</span>
            ${FORECAST_TABS.map(
              (tab) =>
                tab.enabled
                  ? `<button type="button" class="feature-tab${tab.id === "overview" ? " is-active" : ""}" data-forecast-tab="${tab.id}" aria-pressed="${String(tab.id === "overview")}">${tab.label}</button>`
                  : `<span class="feature-tab feature-tab--disabled" aria-disabled="true">${tab.label}</span>`,
            ).join("")}
          </div>
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
          <p class="forecast-panel-copy">Pannello orario con vista termica, trend giornaliero e contesto astronomico.</p>
        </div>

        <div class="forecast-panel-meta">
          <span id="forecast-feels-like-toggle-label" class="forecast-panel-meta-label">Percepita</span>
          <button
            type="button"
            id="forecast-feels-like-toggle"
            class="forecast-panel-meta-switch"
            aria-labelledby="forecast-feels-like-toggle-label"
            aria-pressed="false"
          ></button>
        </div>
      </div>

      <div id="forecast-chart" class="forecast-chart" aria-live="polite">${renderForecastChart(null, "celsius")}</div>
    </section>
  `;
}
