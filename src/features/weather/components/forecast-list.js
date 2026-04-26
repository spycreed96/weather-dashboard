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

export function renderForecastItems(forecastDays, selectedDate = "", unit = "celsius", mode = "overview") {
  const visibleDays = forecastDays.slice(0, 11);

  if (!visibleDays.length) {
    return '<p class="forecast-empty">Previsioni giornaliere non disponibili.</p>';
  }

  return visibleDays
    .map((day) => {
      const iconUrl = getWeatherIconUrl(day.icon, "2x");
      const isSelected = day.date === selectedDate;
      const isPrecipitationMode = mode === "precipitation";
      const isWindMode = mode === "wind";

      return `
        <button
          type="button"
          class="forecast-day-card${isPrecipitationMode ? " forecast-day-card--precipitation" : ""}${isWindMode ? " forecast-day-card--wind" : ""}${isSelected ? " is-active" : ""}"
          data-date="${day.date}"
          aria-pressed="${String(isSelected)}"
        >
          <div class="forecast-day-header">
            <span class="forecast-day-number">${day.day_of_month}</span>
            <span class="forecast-day-label">${day.label}</span>
          </div>
          ${isPrecipitationMode
            ? renderForecastPrecipitationCardBody(day)
            : isWindMode
              ? renderForecastWindCardBody(day)
              : renderForecastTemperatureCardBody(day, unit, iconUrl)}
        </button>
      `;
    })
    .join("");
}

function renderForecastWindCardBody(day) {
  const windSpeed = getForecastWindSpeed(day);
  const currentWindSpeed = getForecastCurrentWindSpeed(day);
  const gustSpeed = getForecastWindGust(day);
  const meterHeight = Math.max(12, Math.min(68, windSpeed * 1.7));

  return `
    <div class="forecast-day-body forecast-day-body--wind">
      <div class="forecast-day-wind">
        <strong class="forecast-day-wind-speed">${formatForecastSpeed(windSpeed)}<span> km/h</span></strong>
        <span class="forecast-day-wind-current">${formatForecastSpeed(currentWindSpeed)} km/h</span>
        <span class="forecast-day-wind-gust">Raffiche: ${gustSpeed === null ? "--" : `${formatForecastSpeed(gustSpeed)}km/h`}</span>
      </div>
      <span class="forecast-day-wind-meter" aria-hidden="true">
        <span style="height: ${meterHeight}%"></span>
      </span>
    </div>
  `;
}

function renderForecastTemperatureCardBody(day, unit, iconUrl) {
  return `
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
  `;
}

function renderForecastPrecipitationCardBody(day) {
  const precipitationTotal = getForecastPrecipitationTotal(day);
  const precipitationProbability = getForecastPrecipitationProbability(day);
  const meterHeight = Math.max(8, Math.min(68, precipitationTotal * 4));

  return `
    <div class="forecast-day-body forecast-day-body--precipitation">
      <div class="forecast-day-precipitation">
        <strong class="forecast-day-precipitation-amount">${formatForecastMillimeters(precipitationTotal)}<span> mm</span></strong>
        <span class="forecast-day-precipitation-chance">
          <span class="forecast-day-precipitation-drop" aria-hidden="true"></span>
          ${precipitationProbability === null ? "--" : `${precipitationProbability}%`}
        </span>
      </div>
      <span class="forecast-day-precipitation-meter" aria-hidden="true">
        <span style="height: ${meterHeight}%"></span>
      </span>
    </div>
  `;
}

export function renderForecastChart(day, unit = "celsius", weatherData = null, showFeelsLike = false) {
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
  const moonPhaseLabel = capitalizeText(day?.moon_phase_label || weatherData?.moon_phase_label || "fase non disponibile");
  const hasFeelsLikeData = hourlyForecast.some(
    (point) =>
      !point?.is_now
      && (point?.feels_like !== undefined
        || point?.feelsLike !== undefined
        || point?.apparent_temperature !== undefined)
      && (point?.feels_like ?? point?.feelsLike ?? point?.apparent_temperature) !== null,
  );
  const showFeelsLikeLegend = showFeelsLike && hasFeelsLikeData;
  const feelsLikeLegendClass = `forecast-chart-legend-item forecast-chart-legend-item--feels-like${showFeelsLikeLegend ? " is-visible" : ""}`;
  const chartStatusMarkup = showFeelsLikeLegend
    ? `
        <div class="forecast-chart-status" aria-hidden="true">
          <span class="forecast-chart-status-dot"></span>
          <span class="forecast-chart-status-text">Percepita</span>
        </div>
      `
    : "";

  return `
    <div class="forecast-chart-shell">
      <div class="forecast-chart-copy-row">
        <div class="forecast-chart-heading">
          <p class="forecast-chart-kicker">Panoramica</p>
          <h4 class="forecast-chart-title">${formatForecastHeading(day)}</h4>
        </div>

        ${chartStatusMarkup}
      </div>

      <div class="forecast-chart-stage">
        <div class="forecast-chart-canvas-embed">
          <canvas id="forecast-day-chart-canvas" width="760" height="320" aria-label="Grafico temperatura del giorno"></canvas>
        </div>
      </div>

      <div class="forecast-chart-footer">
        <div class="forecast-chart-legend" aria-label="Legenda grafico">
          <span class="forecast-chart-legend-item forecast-chart-legend-item--temperature">
            <span class="forecast-chart-legend-dot" aria-hidden="true"></span>
            <span class="forecast-chart-legend-text">Temperatura</span>
          </span>
          <span class="${feelsLikeLegendClass}" aria-hidden="${String(!showFeelsLikeLegend)}">
            <span class="forecast-chart-legend-dash" aria-hidden="true"></span>
            <span class="forecast-chart-legend-text">Percepita</span>
          </span>
        </div>

        <div class="forecast-chart-lunar">
          <span class="forecast-chart-lunar-dot" aria-hidden="true"></span>
          <span class="forecast-chart-lunar-text">Fase lunare: <strong>${moonPhaseLabel}</strong></span>
        </div>
      </div>
    </div>
  `;
}

function getForecastPrecipitationTotal(day) {
  const value = Number(day?.precipitation_total_mm ?? 0);
  return Number.isFinite(value) ? Math.max(value, 0) : 0;
}

function getForecastPrecipitationProbability(day) {
  const value = Number(day?.precipitation_probability);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : null;
}

function getForecastWindSpeed(day) {
  const value = Number(day?.wind_speed_kph ?? 0);
  return Number.isFinite(value) ? Math.max(value, 0) : 0;
}

function getForecastCurrentWindSpeed(day) {
  const value = Number(day?.wind_current_speed_kph ?? day?.wind_speed_kph ?? 0);
  return Number.isFinite(value) ? Math.max(value, 0) : 0;
}

function getForecastWindGust(day) {
  const value = Number(day?.wind_gust_kph);
  return Number.isFinite(value) ? Math.max(value, 0) : null;
}

function formatForecastSpeed(value) {
  const numericValue = Number(value);
  return String(Number.isFinite(numericValue) ? Math.round(numericValue) : 0);
}

function formatForecastMillimeters(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "0";
  }

  if (numericValue < 1) {
    return numericValue.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }

  if (numericValue < 20 && !Number.isInteger(numericValue)) {
    return numericValue.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }

  return String(Math.round(numericValue));
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

  if (point?.is_now) {
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
