import { getWeatherIconUrl } from "../utils/weather-formatters.js";

const DEFAULT_PRECIPITATION_OPTIONS = {
  range: "24h",
  showAccumulation: true,
};

export function renderPrecipitationForecastChart(day, options = DEFAULT_PRECIPITATION_OPTIONS) {
  if (!day) {
    return '<div class="forecast-chart-empty">Seleziona un giorno per vedere le precipitazioni nel tempo.</div>';
  }

  const hourlyForecast = Array.isArray(day.hourly_forecast) ? day.hourly_forecast : [];
  if (!hourlyForecast.length) {
    return `<div class="forecast-chart-empty">Dati precipitazioni non disponibili per ${formatForecastHeading(day)}.</div>`;
  }

  const resolvedOptions = { ...DEFAULT_PRECIPITATION_OPTIONS, ...options };
  const isFourHourRange = resolvedOptions.range === "4h";
  const isAccumulationActive = Boolean(resolvedOptions.showAccumulation);

  return `
    <div class="forecast-chart-shell forecast-chart-shell--precipitation">
      <div class="forecast-precipitation-header">
        <h4 class="forecast-precipitation-title">Precipitazioni</h4>

        <div class="forecast-precipitation-controls" aria-label="Opzioni precipitazioni">
          <button
            type="button"
            class="forecast-precipitation-range${isFourHourRange ? " is-active" : ""}"
            data-precipitation-range="4h"
            aria-pressed="${String(isFourHourRange)}"
          >
            <span class="forecast-precipitation-range-indicator" aria-hidden="true"></span>
            <span>4 ore</span>
          </button>
          <button
            type="button"
            class="forecast-precipitation-range${!isFourHourRange ? " is-active" : ""}"
            data-precipitation-range="24h"
            aria-pressed="${String(!isFourHourRange)}"
          >
            <span class="forecast-precipitation-range-indicator" aria-hidden="true"></span>
            <span>24 ore</span>
          </button>
          <button
            type="button"
            class="forecast-precipitation-accumulation-toggle${isAccumulationActive ? " is-active" : ""}"
            data-precipitation-accumulation
            aria-pressed="${String(isAccumulationActive)}"
          >
            <span class="forecast-precipitation-toggle-track" aria-hidden="true">
              <span class="forecast-precipitation-toggle-thumb"></span>
            </span>
            <span>Accumulo</span>
          </button>
        </div>
      </div>

      <div class="forecast-precipitation-stage">
        <div class="forecast-precipitation-canvas-embed">
          <canvas id="forecast-precipitation-chart-canvas" width="860" height="320" aria-label="Grafico precipitazioni del giorno"></canvas>
        </div>
      </div>

      <div class="forecast-precipitation-legend" aria-label="Legenda precipitazioni">
        <span class="forecast-precipitation-legend-item">
          <span class="forecast-precipitation-legend-dot forecast-precipitation-legend-dot--rain" aria-hidden="true"></span>
          <span>Pioggia</span>
        </span>
        <span class="forecast-precipitation-legend-item">
          <span class="forecast-precipitation-legend-dot forecast-precipitation-legend-dot--snow" aria-hidden="true"></span>
          <span>Neve</span>
        </span>
        <span class="forecast-precipitation-legend-item">
          <span class="forecast-precipitation-legend-dot forecast-precipitation-legend-dot--mixed" aria-hidden="true"></span>
          <span>Pioggia/neve</span>
        </span>
        <span class="forecast-precipitation-legend-item forecast-precipitation-legend-item--accumulation">
          <span class="forecast-precipitation-legend-line" aria-hidden="true"></span>
          <span>Accumulo</span>
        </span>
      </div>
    </div>
  `;
}

export function initPrecipitationForecastChart(day, options = DEFAULT_PRECIPITATION_OPTIONS) {
  const canvas = document.getElementById("forecast-precipitation-chart-canvas");
  if (!canvas || typeof Chart === "undefined" || !day) return null;

  const resolvedOptions = { ...DEFAULT_PRECIPITATION_OPTIONS, ...options };
  const points = getVisiblePrecipitationPoints(day, resolvedOptions.range);
  if (!points.length) return null;

  if (canvas._chartInstance) canvas._chartInstance.destroy();

  const accumulationData = [];
  let accumulation = 0;

  const rainData = points.map((item) => createPrecipitationDatasetPoint(item, "rain"));
  const snowData = points.map((item) => createPrecipitationDatasetPoint(item, "snow"));
  const mixedData = points.map((item) => createPrecipitationDatasetPoint(item, "mixed"));
  const precipitationData = points.map((item) => {
    accumulation += item.precipitation;
    const point = {
      x: item.x,
      y: roundMillimeters(accumulation),
      __meta: item,
    };
    accumulationData.push(point);
    return item.precipitation;
  });

  const chartMaximum = getPrecipitationChartMaximum(
    resolvedOptions.showAccumulation ? [...precipitationData, ...accumulationData.map((item) => item.y)] : precipitationData,
  );
  const labelItems = points.map((item) => {
    const iconUrl = getWeatherIconUrl(item.icon || "", "2x");
    const img = iconUrl ? new Image() : null;

    if (img) {
      img.src = iconUrl;
    }

    return {
      ...item,
      img,
    };
  });

  const precipitationLabelsPlugin = createPrecipitationLabelsPlugin(labelItems, resolvedOptions.range);
  const datasets = [
    createPrecipitationBarDataset("Pioggia", rainData, "rgba(66, 114, 255, 0.86)"),
    createPrecipitationBarDataset("Neve", snowData, "rgba(132, 195, 255, 0.86)"),
    createPrecipitationBarDataset("Pioggia/neve", mixedData, "rgba(105, 229, 255, 0.88)"),
  ];

  if (resolvedOptions.showAccumulation) {
    datasets.push({
      type: "line",
      label: "Accumulo",
      data: accumulationData,
      borderColor: "rgba(126, 220, 255, 0.96)",
      borderWidth: 2,
      borderCapStyle: "round",
      borderJoinStyle: "round",
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0.32,
      fill: false,
      order: 1,
      yAxisID: "y",
    });
  }

  const chart = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      layout: { padding: { top: 58, right: 10, bottom: 0, left: 4 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title(items) {
              if (!items.length) return "";
              const meta = items[0].raw?.__meta;
              return meta?.label || formatTimeLabel(new Date(items[0].parsed.x));
            },
            label(item) {
              const value = Number(item.parsed.y);
              return `${item.dataset.label}: ${formatMillimeters(value)} mm`;
            },
            afterBody(items) {
              const meta = items[0]?.raw?.__meta;
              if (!meta || meta.probability === null) return "";
              return `Probabilita': ${meta.probability}%`;
            },
          },
        },
      },
      scales: {
        x: {
          type: "time",
          time: { unit: "hour", displayFormats: { hour: "HH:mm" } },
          grid: {
            color: "rgba(255, 255, 255, 0.07)",
            drawBorder: false,
          },
          ticks: { display: false },
        },
        y: {
          min: 0,
          max: chartMaximum,
          position: "left",
          grid: {
            color: "rgba(255, 255, 255, 0.08)",
            drawBorder: false,
          },
          ticks: {
            callback: (value) => formatMillimeters(value),
            maxTicksLimit: 4,
          },
          title: {
            display: true,
            text: "mm",
            color: "rgba(235, 238, 255, 0.72)",
            font: { size: 12, weight: "700" },
          },
        },
        yRight: {
          min: 0,
          max: chartMaximum,
          position: "right",
          grid: { drawOnChartArea: false, drawBorder: false },
          ticks: {
            callback: (value) => formatMillimeters(value),
            maxTicksLimit: 4,
          },
          title: {
            display: true,
            text: "mm",
            color: "rgba(235, 238, 255, 0.72)",
            font: { size: 12, weight: "700" },
          },
        },
      },
    },
    plugins: [precipitationLabelsPlugin],
  });

  canvas._chartInstance = chart;
  return chart;
}

function createPrecipitationDatasetPoint(item, type) {
  return {
    x: item.x,
    y: item.type === type ? item.precipitation : 0,
    __meta: item,
  };
}

function createPrecipitationBarDataset(label, data, color) {
  return {
    type: "bar",
    label,
    data,
    backgroundColor: color,
    borderColor: color,
    borderRadius: 4,
    borderSkipped: false,
    barPercentage: 0.62,
    categoryPercentage: 0.72,
    maxBarThickness: 18,
    order: 2,
    yAxisID: "y",
  };
}

function getVisiblePrecipitationPoints(day, range) {
  const hourly = Array.isArray(day.hourly_forecast) ? day.hourly_forecast : [];
  const now = new Date();
  const forecastDate = parseForecastDate(day.date);
  const isTodayForecast = forecastDate ? isSameLocalDate(forecastDate, now) : false;
  const allPoints = hourly
    .map((point) => {
      const pointDate = resolveHourlyPointDate(point, forecastDate, now);
      if (!pointDate) return null;

      return {
        x: pointDate.toISOString(),
        ms: pointDate.getTime(),
        label: point?.is_now ? "Adesso" : formatTimeLabel(pointDate),
        icon: point?.icon || "",
        precipitation: getPrecipitationAmount(point),
        probability: getPrecipitationProbability(point),
        type: normalizePrecipitationType(point),
        description: point?.description || "",
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.ms - right.ms);

  if (range !== "4h") {
    return allPoints;
  }

  const start = isTodayForecast ? now.getTime() : allPoints[0]?.ms ?? 0;
  const end = start + 4 * 60 * 60 * 1000;
  const visiblePoints = allPoints.filter((point) => point.ms >= start && point.ms <= end);
  return visiblePoints.length ? visiblePoints : allPoints.slice(0, 5);
}

function createPrecipitationLabelsPlugin(labelItems, range) {
  return {
    id: "precipitationLabels",
    afterDraw(chart) {
      const xScale = chart.scales?.x;
      if (!xScale || !chart.chartArea) return;

      const ctx = chart.ctx;
      const chartArea = chart.chartArea;
      const labelStep = getPrecipitationLabelStep(range);

      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "12px system-ui, Arial";
      ctx.fillStyle = "rgba(235, 238, 255, 0.78)";

      labelItems.forEach((item, index) => {
        const x = xScale.getPixelForValue(item.ms);
        if (x < chartArea.left - 28 || x > chartArea.right + 28) return;
        if (range !== "4h" && index % labelStep !== 0 && item.label !== "Adesso") return;

        ctx.fillText(item.label, x, chartArea.top - 38);

        if (item.img && item.img.complete) {
          const size = 24;
          ctx.drawImage(item.img, Math.round(x - size / 2), Math.round(chartArea.top - 28), size, size);
        } else if (item.img) {
          item.img.onload = () => chart.draw();
        }
      });

      ctx.restore();
    },
  };
}

function getPrecipitationLabelStep(range) {
  if (range === "4h") {
    return 1;
  }

  if (typeof window !== "undefined" && window.innerWidth <= 640) {
    return 4;
  }

  return 2;
}

function getPrecipitationChartMaximum(values) {
  const maximum = Math.max(...values.map((value) => Number(value)).filter(Number.isFinite), 0);
  if (maximum <= 0.2) return 0.2;
  if (maximum <= 1) return Math.ceil(maximum * 10) / 10;
  if (maximum <= 10) return Math.ceil(maximum);
  return Math.ceil(maximum / 5) * 5;
}

function getPrecipitationAmount(point) {
  const value = Number(point?.precipitation_mm ?? 0);
  return Number.isFinite(value) ? roundMillimeters(Math.max(value, 0)) : 0;
}

function getPrecipitationProbability(point) {
  const value = Number(point?.precipitation_probability);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : null;
}

function normalizePrecipitationType(point) {
  const type = String(point?.precipitation_type || "").toLowerCase();
  if (type === "snow" || type === "mixed" || type === "rain") {
    return type;
  }

  return getPrecipitationAmount(point) > 0 ? "rain" : "none";
}

function parseForecastDate(dateValue) {
  if (!dateValue) return null;

  const [year, month, dayOfMonth] = String(dateValue).split("-").map(Number);
  const parsedDate = new Date(year, (month || 1) - 1, dayOfMonth || 1);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function resolveHourlyPointDate(point, forecastDate, now) {
  if (point?.is_now) {
    return new Date(now);
  }

  const pointLabel = String(point?.time_label || "").trim();
  const timeMatch = pointLabel.match(/^(\d{1,2}):(\d{2})$/);
  if (!timeMatch) return null;

  const baseDate = forecastDate ? new Date(forecastDate) : new Date(now);
  baseDate.setHours(Number(timeMatch[1]), Number(timeMatch[2]), 0, 0);
  return baseDate;
}

function isSameLocalDate(leftDate, rightDate) {
  return leftDate.getFullYear() === rightDate.getFullYear()
    && leftDate.getMonth() === rightDate.getMonth()
    && leftDate.getDate() === rightDate.getDate();
}

function formatForecastHeading(day) {
  if (!day?.date) return "giorno selezionato";

  const [year, month, dayOfMonth] = day.date.split("-").map(Number);
  const parsedDate = new Date(year, month - 1, dayOfMonth);

  return Number.isNaN(parsedDate.getTime())
    ? day.date
    : parsedDate.toLocaleDateString("it-IT", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
}

function formatTimeLabel(dateValue) {
  return `${String(dateValue.getHours()).padStart(2, "0")}:${String(dateValue.getMinutes()).padStart(2, "0")}`;
}

function formatMillimeters(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "0";

  if (numericValue === 0) return "0";
  if (numericValue < 1) return numericValue.toFixed(1);
  if (numericValue < 10 && !Number.isInteger(numericValue)) return numericValue.toFixed(1);
  return String(Math.round(numericValue));
}

function roundMillimeters(value) {
  return Math.round(Number(value) * 100) / 100;
}
