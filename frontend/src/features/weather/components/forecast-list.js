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

export function renderForecastChart(day, unit = "celsius", weatherData = null) {
  if (!day) {
    return '<div class="forecast-chart-empty">Seleziona un giorno per vedere l\'andamento della temperatura nel tempo.</div>';
  }

  const hourlyForecast = Array.isArray(day.hourly_forecast) ? day.hourly_forecast : [];
  if (!hourlyForecast.length) {
    return `<div class="forecast-chart-empty">Dati orari non disponibili per ${formatForecastHeading(day)}.</div>`;
  }

  const SLOT_COUNT = 12;
  const SLOT_INTERVAL_MS = 2 * 60 * 60 * 1000;
  const OVERLAY_X1 = 28;
  const OVERLAY_X2 = 732;
  const overlayPlotWidth = OVERLAY_X2 - OVERLAY_X1;
  const slotWidth = overlayPlotWidth / SLOT_COUNT;
  const firstSlotCenter = OVERLAY_X1 + slotWidth / 2;
  const lastSlotCenter = OVERLAY_X2 - slotWidth / 2;
  const overlayInsetStart = ((OVERLAY_X1 / CHART_WIDTH) * 100).toFixed(4);
  const overlayInsetEnd = (((CHART_WIDTH - OVERLAY_X2) / CHART_WIDTH) * 100).toFixed(4);
  const now = new Date();
  const currentHourLabel = formatHourLabel(now);
  const forecastDate = parseForecastDate(day.date);
  const isTodayForecast = forecastDate ? isSameLocalDate(forecastDate, now) : true;
  const firstSlotDate = forecastDate ? new Date(forecastDate) : new Date(now);

  if (isTodayForecast) {
    firstSlotDate.setHours(now.getHours() - 2, 0, 0, 0);
  } else {
    firstSlotDate.setHours(0, 0, 0, 0);
  }

  const timelineStart = firstSlotDate.getTime();
  const timelineEnd = timelineStart + (SLOT_COUNT - 1) * SLOT_INTERVAL_MS;

  const resolvedHourlyForecast = hourlyForecast
    .map((point) => {
      const pointDate = resolveHourlyPointDate(point, forecastDate, now);

      if (!pointDate) {
        return null;
      }

      return {
        point,
        pointDate,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.pointDate.getTime() - right.pointDate.getTime());

  const plottedHourlyForecast = resolvedHourlyForecast.filter(({ pointDate }) => {
    const pointTime = pointDate.getTime();
    return pointTime >= timelineStart && pointTime <= timelineEnd;
  });

  const visibleHourlyForecast = plottedHourlyForecast.length ? plottedHourlyForecast : resolvedHourlyForecast;
  if (!visibleHourlyForecast.length) {
    return `<div class="forecast-chart-empty">Dati orari non disponibili per ${formatForecastHeading(day)}.</div>`;
  }

  const chartValues = visibleHourlyForecast.map(({ point }) => convertTemperatureValue(point.temperature, unit));
  const minValue = Math.min(...chartValues);
  const maxValue = Math.max(...chartValues);
  const paddedRange = Math.max(4, Math.ceil((maxValue - minValue) * 0.35));
  const lowerBound = Math.floor(minValue - paddedRange / 2);
  const upperBound = Math.ceil(maxValue + paddedRange / 2);
  const safeRange = Math.max(upperBound - lowerBound, 4);
  const plotHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

  const points = visibleHourlyForecast.map(({ point, pointDate }, index) => {
    const value = chartValues[index];
    const normalized = (value - lowerBound) / safeRange;
    const slotOffset = (pointDate.getTime() - timelineStart) / SLOT_INTERVAL_MS;
    const x = Math.min(lastSlotCenter, Math.max(firstSlotCenter, firstSlotCenter + slotOffset * slotWidth));

    return {
      ...point,
      x,
      y: CHART_HEIGHT - CHART_PADDING.bottom - normalized * plotHeight,
      value,
    };
  });

  const ticks = Array.from({ length: 5 }, (_, index) => upperBound - (safeRange / 4) * index);
  const linePath = buildSmoothPath(points);
  const areaPath = buildAreaPath(points, CHART_HEIGHT - CHART_PADDING.bottom);

  const timelineSlots = Array.from({ length: SLOT_COUNT }, (_, index) => {
    const slotDate = new Date(timelineStart + index * SLOT_INTERVAL_MS);
    const slotLabel = formatHourLabel(slotDate);
    const isCurrentSlot = isTodayForecast && slotLabel === currentHourLabel;

    let found = visibleHourlyForecast.find(({ point }) => point.time_label === slotLabel)?.point;

    if (!found && visibleHourlyForecast.length) {
      found = visibleHourlyForecast.reduce((best, candidate) => {
        if (!best) {
          return candidate;
        }

        const bestDiff = Math.abs(best.pointDate.getTime() - slotDate.getTime());
        const candidateDiff = Math.abs(candidate.pointDate.getTime() - slotDate.getTime());
        return candidateDiff < bestDiff ? candidate : best;
      }, null)?.point;
    }

    if (!found) {
      return {
        time_label: slotLabel,
        temperature: null,
        icon: "",
        description: "",
        is_now: isCurrentSlot,
      };
    }

    return {
      ...found,
      time_label: slotLabel,
      is_now: found.is_now || isCurrentSlot,
    };
  });

  const verticalOverlay = timelineSlots.map(() => '<div class="forecast-chart-vertical-cell"></div>').join("");
  const moonPhaseLabel = capitalizeText(weatherData?.moon_phase_label || "fase non disponibile");

  return `
    <div class="forecast-chart-shell">
      <div class="forecast-chart-copy-row">
        <div class="forecast-chart-heading">
          <p class="forecast-chart-kicker">Panoramica</p>
          <h4 class="forecast-chart-title">${formatForecastHeading(day)}</h4>
        </div>

        <div class="forecast-chart-status" aria-hidden="true">
          <span class="forecast-chart-status-dot"></span>
          <span class="forecast-chart-status-text">Percepita</span>
        </div>
      </div>

      <div class="forecast-chart-stage">
        <div class="forecast-chart-plot" style="--forecast-point-count: ${SLOT_COUNT}; --forecast-plot-start: ${overlayInsetStart}%; --forecast-plot-end: ${overlayInsetEnd}%;">
          <div class="forecast-chart-timeline">
            ${timelineSlots
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
                  <stop offset="0%" stop-color="rgba(255, 213, 138, 0.34)" />
                  <stop offset="55%" stop-color="rgba(184, 224, 165, 0.2)" />
                  <stop offset="100%" stop-color="rgba(255, 136, 98, 0.02)" />
                </linearGradient>
              </defs>

              ${ticks
                .map((tick) => {
                  const y = CHART_HEIGHT - CHART_PADDING.bottom - ((tick - lowerBound) / safeRange) * plotHeight;

                  return `
                    <line class="forecast-chart-grid" x1="28" y1="${y}" x2="732" y2="${y}" />
                    <text class="forecast-chart-axis-label" x="23" y="${y + 4}" text-anchor="end">${formatAxisTemperature(tick, unit)}</text>
                  `;
                })
                .join("")}

              <path class="forecast-chart-area" d="${areaPath}" />
              <path class="forecast-chart-line" d="${linePath}" />

              ${points
                .map(
                  (point, index) => `
                    <circle
                      class="forecast-chart-point${point.is_now ? " forecast-chart-point--now" : ""}"
                      cx="${point.x}"
                      cy="${point.y}"
                      r="${point.is_now ? 5.5 : 4.5}"
                      data-index="${index}"
                      data-time="${point.time_label}"
                      data-temp="${point.temperature}"
                      data-icon="${getWeatherIconUrl(point.icon, "2x") || ""}"
                    />
                  `,
                )
                .join("")}
            </svg>

            <div class="forecast-chart-verticals" aria-hidden="true">
              ${verticalOverlay}
            </div>

            <div class="forecast-chart-tooltip" aria-hidden="true">
              <div class="forecast-chart-tooltip-inner">
                <div class="forecast-chart-tooltip-time">00:00</div>
                <img class="forecast-chart-tooltip-icon" src="" alt="" />
                <div class="forecast-chart-tooltip-temp">--°</div>
              </div>
            </div>
          </div>
        </div>

        <div class="forecast-chart-footer">
          <div class="forecast-chart-legend">
            <span class="forecast-chart-legend-dot"></span>
            <span class="forecast-chart-legend-text">Temperatura</span>
          </div>

          <div class="forecast-chart-lunar">
            <span class="forecast-chart-lunar-dot"></span>
            <span class="forecast-chart-lunar-text">Fase lunare: <strong>${moonPhaseLabel}</strong></span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function formatAxisTemperature(value, unit = "celsius") {
  const showDegree = shouldShowTemperatureDegree(unit);

  return `<tspan class="forecast-chart-axis-label-value">${Math.round(value)}</tspan>${showDegree ? '<tspan class="forecast-chart-axis-label-degree">°</tspan>' : ""}${showDegree ? "" : `<tspan class="forecast-chart-axis-label-unit forecast-chart-axis-label-unit--solo">${getTemperatureUnitCharacter(unit)}</tspan>`}`;
}

function parseForecastDate(dateValue) {
  if (!dateValue) {
    return null;
  }

  const [year, month, dayOfMonth] = String(dateValue).split("-").map(Number);
  const parsedDate = new Date(year, (month || 1) - 1, dayOfMonth || 1);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function isSameLocalDate(leftDate, rightDate) {
  return leftDate.getFullYear() === rightDate.getFullYear()
    && leftDate.getMonth() === rightDate.getMonth()
    && leftDate.getDate() === rightDate.getDate();
}

function formatHourLabel(dateValue) {
  return `${String(dateValue.getHours()).padStart(2, "0")}:${String(dateValue.getMinutes()).padStart(2, "0")}`;
}

function resolveHourlyPointDate(point, forecastDate, now) {
  const pointLabel = String(point?.time_label || "").trim();
  const normalizedLabel = pointLabel.toLowerCase();

  if (point?.is_now || normalizedLabel === "adesso") {
    return new Date(now);
  }

  const timeMatch = pointLabel.match(/^(\d{1,2}):(\d{2})$/);
  if (!timeMatch) {
    return null;
  }

  const baseDate = forecastDate ? new Date(forecastDate) : new Date(now);
  baseDate.setHours(Number(timeMatch[1]), Number(timeMatch[2]), 0, 0);
  return baseDate;
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
