import {
  capitalizeText,
  formatTemperature,
  getTemperatureUnitCharacter,
  renderDetailInlineTemperature,
  shouldShowTemperatureDegree,
  getWeatherIconUrl,
} from "../utils/weather-formatters.js";
import { buildAreaPath, buildSmoothPath, convertTemperatureValue } from "../utils/chart-helpers.js";

const CHART_WIDTH = 760;
const CHART_HEIGHT = 260;
const CHART_PADDING = {
  top: 16,
  right: 18,
  bottom: 20,
  left: 54,
};

export function renderForecastList() {
  return `
    <section class="forecast-panel" aria-labelledby="forecast-panel-title">
      <div class="forecast-panel-header">
        <div>
          <h3 id="forecast-panel-title">Panoramica</h3>
          <p class="forecast-panel-copy">Seleziona un giorno dalla lista delle previsioni per aggiornare la curva della temperatura.</p>
        </div>
      </div>
      <div id="forecast-chart" class="forecast-chart" aria-live="polite"></div>
      <div class="forecast-carousel">
        <button id="forecast-prev" class="forecast-nav-btn" type="button" aria-label="Scorri forecast a sinistra">&larr;</button>
        <div id="daily-forecast-list" class="daily-forecast-list" aria-label="Previsioni giornaliere"></div>
        <button id="forecast-next" class="forecast-nav-btn" type="button" aria-label="Scorri forecast a destra">&rarr;</button>
      </div>
    </section>
  `;
}

export function renderForecastItems(forecastDays, selectedDate = "", unit = "celsius") {
  const visibleDays = forecastDays.slice(0, 11);

  if (!visibleDays.length) {
    return '<p class="forecast-empty">Previsioni giornaliere non disponibili.</p>';
  }

  return visibleDays
    .map((day) => {
      const iconUrl = getWeatherIconUrl(day.icon, "2x");
      const isSelected = day.date === selectedDate;

      return `
        <button
          type="button"
          class="forecast-day-card${isSelected ? " is-active" : ""}"
          data-date="${day.date}"
          aria-pressed="${String(isSelected)}"
        >
          <div class="forecast-day-header">
            <span class="forecast-day-number">${day.day_of_month}</span>
            <span class="forecast-day-label">${day.label}</span>
          </div>
          <div class="forecast-day-body">
            <div class="forecast-day-icon">
              ${iconUrl ? `<img src="${iconUrl}" alt="${day.description}" />` : "<span>Cloud</span>"}
            </div>
            <div class="forecast-day-temperatures">
              <div class="forecast-temperature-group">
                <span class="forecast-temperature-label">Max</span>
                <strong class="forecast-temperature-value" data-celsius="${day.max_temperature}" aria-label="${formatTemperature(day.max_temperature, unit)}">${renderDetailInlineTemperature(day.max_temperature, unit)}</strong>
              </div>
              <div class="forecast-temperature-group">
                <span class="forecast-temperature-label">Ora</span>
                <strong class="forecast-temperature-value" data-celsius="${day.current_temperature}" aria-label="${formatTemperature(day.current_temperature, unit)}">${renderDetailInlineTemperature(day.current_temperature, unit)}</strong>
              </div>
            </div>
          </div>
        </button>
      `;
    })
    .join("");
}

export function renderForecastChart(day, unit = "celsius") {
  if (!day) {
    return '<div class="forecast-chart-empty">Seleziona un giorno per vedere l\'andamento della temperatura nel tempo.</div>';
  }

  const hourlyForecast = Array.isArray(day.hourly_forecast) ? day.hourly_forecast : [];
  if (!hourlyForecast.length) {
    return `<div class="forecast-chart-empty">Dati orari non disponibili per ${formatForecastHeading(day)}.</div>`;
  }

  const plotWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const plotHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
  const chartValues = hourlyForecast.map((point) => convertTemperatureValue(point.temperature, unit));
  const minValue = Math.min(...chartValues);
  const maxValue = Math.max(...chartValues);
  const paddedRange = Math.max(4, Math.ceil((maxValue - minValue) * 0.35));
  const lowerBound = Math.floor(minValue - paddedRange / 2);
  const upperBound = Math.ceil(maxValue + paddedRange / 2);
  const safeRange = Math.max(upperBound - lowerBound, 4);
  const xStep = hourlyForecast.length > 1 ? plotWidth / (hourlyForecast.length - 1) : 0;
  const points = hourlyForecast.map((point, index) => {
    const value = chartValues[index];
    const normalized = (value - lowerBound) / safeRange;

    return {
      ...point,
      x: CHART_PADDING.left + xStep * index,
      y: CHART_HEIGHT - CHART_PADDING.bottom - normalized * plotHeight,
      value,
    };
  });
  const ticks = Array.from({ length: 5 }, (_, index) => upperBound - (safeRange / 4) * index);
  const linePath = buildSmoothPath(points);
  const areaPath = buildAreaPath(points, CHART_HEIGHT - CHART_PADDING.bottom);

  return `
    <div class="forecast-chart-shell">
      <div class="forecast-chart-copy-row">
        <div>
          <p class="forecast-chart-kicker">Temperatura nel tempo</p>
          <h4 class="forecast-chart-title">${formatForecastHeading(day)}</h4>
        </div>
        <p class="forecast-chart-description">Asse X: tempo. Asse Y: temperatura.</p>
      </div>

      <div class="forecast-chart-timeline" style="--forecast-point-count: ${hourlyForecast.length};">
        ${hourlyForecast
          .map((point) => {
            const iconUrl = getWeatherIconUrl(point.icon, "2x");

            return `
              <div class="forecast-chart-slot">
                <span class="forecast-chart-time${point.is_now ? " forecast-chart-time--now" : ""}">${point.time_label}</span>
                ${iconUrl ? `<img class="forecast-chart-icon" src="${iconUrl}" alt="${point.description}" />` : '<span class="forecast-chart-icon-placeholder">-</span>'}
                <span class="forecast-chart-value" aria-label="${formatTemperature(point.temperature, unit)}">${renderDetailInlineTemperature(point.temperature, unit)}</span>
              </div>
            `;
          })
          .join("")}
      </div>

      <div class="forecast-chart-canvas">
        <svg class="forecast-chart-svg" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" role="img" aria-label="Andamento della temperatura per ${formatForecastHeading(day)}">
          <defs>
            <linearGradient id="forecast-area-gradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="rgba(255, 136, 98, 0.45)" />
              <stop offset="100%" stop-color="rgba(255, 136, 98, 0.03)" />
            </linearGradient>
          </defs>

          ${ticks
            .map((tick) => {
              const y = CHART_HEIGHT - CHART_PADDING.bottom - ((tick - lowerBound) / safeRange) * plotHeight;

              return `
                <line class="forecast-chart-grid" x1="${CHART_PADDING.left}" y1="${y}" x2="${CHART_WIDTH - CHART_PADDING.right}" y2="${y}" />
                <text class="forecast-chart-axis-label" x="${CHART_PADDING.left - 14}" y="${y + 4}" text-anchor="end">${formatAxisTemperature(tick, unit)}</text>
              `;
            })
            .join("")}

          <path class="forecast-chart-area" d="${areaPath}" />
          <path class="forecast-chart-line" d="${linePath}" />

          ${points
            .map(
              (point) => `
                <circle class="forecast-chart-point${point.is_now ? " forecast-chart-point--now" : ""}" cx="${point.x}" cy="${point.y}" r="${point.is_now ? 5.5 : 4.5}" />
              `,
            )
            .join("")}
        </svg>
      </div>
    </div>
  `;
}

function formatAxisTemperature(value, unit = "celsius") {
  const showDegree = shouldShowTemperatureDegree(unit);

  return `<tspan class="forecast-chart-axis-label-value">${Math.round(value)}</tspan>${showDegree ? '<tspan class="forecast-chart-axis-label-degree">°</tspan>' : ""}${showDegree ? "" : `<tspan class="forecast-chart-axis-label-unit forecast-chart-axis-label-unit--solo">${getTemperatureUnitCharacter(unit)}</tspan>`}`;
}

function formatForecastHeading(day) {
  if (!day?.date) {
    return "Giorno selezionato";
  }

  const [year, month, dayOfMonth] = day.date.split("-").map(Number);
  const parsedDate = new Date(year, month - 1, dayOfMonth);
  const formattedDate = Number.isNaN(parsedDate.getTime())
    ? day.date
    : parsedDate.toLocaleDateString("it-IT", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });

  return `${capitalizeText(day.label || "")}${day.label ? " · " : ""}${formattedDate}`;
}
