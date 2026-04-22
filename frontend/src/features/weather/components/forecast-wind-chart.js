const DEFAULT_WIND_OPTIONS = {
  showGusts: true,
};

export function renderWindForecastChart(day, options = DEFAULT_WIND_OPTIONS) {
  if (!day) {
    return '<div class="forecast-chart-empty">Seleziona un giorno per vedere il vento nel tempo.</div>';
  }

  const hourlyForecast = Array.isArray(day.hourly_forecast) ? day.hourly_forecast : [];
  if (!hourlyForecast.length) {
    return `<div class="forecast-chart-empty">Dati vento non disponibili per ${formatForecastHeading(day)}.</div>`;
  }

  const resolvedOptions = { ...DEFAULT_WIND_OPTIONS, ...options };

  return `
    <div class="forecast-chart-shell forecast-chart-shell--wind">
      <div class="forecast-wind-header">
        <h4 class="forecast-wind-title">Vento</h4>

        <button
          type="button"
          class="forecast-wind-gust-toggle${resolvedOptions.showGusts ? " is-active" : ""}"
          data-wind-gust-toggle
          aria-pressed="${String(resolvedOptions.showGusts)}"
        >
          <span class="forecast-wind-toggle-track" aria-hidden="true">
            <span class="forecast-wind-toggle-thumb"></span>
          </span>
          <span>Raffiche di vento</span>
        </button>
      </div>

      <div class="forecast-wind-stage">
        <div class="forecast-wind-canvas-embed">
          <canvas id="forecast-wind-chart-canvas" width="860" height="330" aria-label="Grafico vento del giorno"></canvas>
        </div>
      </div>

      <div class="forecast-wind-legend" aria-label="Legenda vento">
        <span class="forecast-wind-legend-item">
          <span class="forecast-wind-legend-dot" aria-hidden="true"></span>
          <span>Velocita del vento</span>
        </span>
        <span class="forecast-wind-legend-item">
          <span class="forecast-wind-legend-line" aria-hidden="true"></span>
          <span>Raffiche di vento</span>
        </span>
      </div>
    </div>
  `;
}

export function initWindForecastChart(day, options = DEFAULT_WIND_OPTIONS) {
  const canvas = document.getElementById("forecast-wind-chart-canvas");
  if (!canvas || typeof Chart === "undefined" || !day) return null;

  const resolvedOptions = { ...DEFAULT_WIND_OPTIONS, ...options };
  const points = getWindPoints(day);
  if (!points.length) return null;

  if (canvas._chartInstance) canvas._chartInstance.destroy();

  const speedData = points.map((item) => ({
    x: item.x,
    y: item.speed,
    __meta: item,
  }));
  const gustData = points.map((item) => ({
    x: item.x,
    y: item.gust,
    __meta: item,
  }));
  const yMaximum = getWindChartMaximum([
    ...speedData.map((item) => item.y),
    ...(resolvedOptions.showGusts ? gustData.map((item) => item.y) : []),
  ]);
  const windLabelsPlugin = createWindLabelsPlugin(points);

  const datasets = [
    {
      type: "line",
      label: "Velocita del vento",
      data: speedData,
      borderColor: "rgba(113, 175, 245, 0.96)",
      backgroundColor: "rgba(81, 136, 207, 0.44)",
      borderWidth: 0,
      borderCapStyle: "round",
      borderJoinStyle: "round",
      pointRadius: 0,
      pointHoverRadius: 5,
      tension: 0.38,
      fill: true,
      order: 2,
    },
  ];

  if (resolvedOptions.showGusts) {
    datasets.push({
      type: "line",
      label: "Raffiche di vento",
      data: gustData,
      borderColor: "rgba(122, 190, 255, 0.98)",
      backgroundColor: "rgba(122, 190, 255, 0)",
      borderWidth: 2,
      borderCapStyle: "round",
      borderJoinStyle: "round",
      pointRadius: 0,
      pointHoverRadius: 5,
      tension: 0.34,
      fill: false,
      order: 1,
      spanGaps: true,
    });
  }

  const chart = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      layout: { padding: { top: 76, right: 10, bottom: 28, left: 4 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title(items) {
              if (!items.length) return "";
              return items[0].raw?.__meta?.label || formatTimeLabel(new Date(items[0].parsed.x));
            },
            label(item) {
              const value = Number(item.parsed.y);
              return `${item.dataset.label}: ${formatSpeed(value)}`;
            },
            afterBody(items) {
              const meta = items[0]?.raw?.__meta;
              if (!meta) return "";
              return `Direzione: ${formatDirection(meta.direction, meta.directionLabel)}`;
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
          max: yMaximum,
          position: "left",
          grid: {
            color: "rgba(255, 255, 255, 0.08)",
            drawBorder: false,
          },
          ticks: {
            callback: (value) => String(Math.round(Number(value))),
            maxTicksLimit: 5,
          },
          title: {
            display: true,
            text: "km/h",
            color: "rgba(235, 238, 255, 0.72)",
            font: { size: 12, weight: "700" },
          },
        },
      },
    },
    plugins: [windLabelsPlugin],
  });

  canvas._chartInstance = chart;
  return chart;
}

function getWindPoints(day) {
  const hourly = Array.isArray(day.hourly_forecast) ? day.hourly_forecast : [];
  const now = new Date();
  const forecastDate = parseForecastDate(day.date);

  return hourly
    .map((point) => {
      const pointDate = resolveHourlyPointDate(point, forecastDate, now);
      if (!pointDate) return null;

      const speed = getWindSpeed(point);
      const gust = getWindGust(point, speed);

      return {
        x: pointDate.toISOString(),
        ms: pointDate.getTime(),
        label: point?.is_now ? "Adesso" : formatTimeLabel(pointDate),
        speed,
        gust,
        direction: getWindDirection(point),
        directionLabel: point?.wind_direction_label || null,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.ms - right.ms);
}

function createWindLabelsPlugin(points) {
  return {
    id: "windLabels",
    afterDraw(chart) {
      const xScale = chart.scales?.x;
      if (!xScale || !chart.chartArea) return;

      const ctx = chart.ctx;
      const chartArea = chart.chartArea;

      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      points.forEach((item) => {
        const x = xScale.getPixelForValue(item.ms);
        if (x < chartArea.left - 28 || x > chartArea.right + 28) return;
        if (!shouldRenderWindLabel(item)) return;

        ctx.font = "12px system-ui, Arial";
        ctx.fillStyle = "rgba(235, 238, 255, 0.78)";
        ctx.fillText(item.label, x, chartArea.top - 42);

        drawWindArrow(ctx, x, chartArea.top - 20, item.direction);
      });

      ctx.restore();
    },
  };
}

function drawWindArrow(ctx, x, y, direction) {
  const sourceDirection = Number.isFinite(direction) ? direction : 0;
  const pushDirection = (sourceDirection + 180) % 360;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((pushDirection * Math.PI) / 180);
  ctx.fillStyle = "rgba(246, 248, 255, 0.96)";
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(5, 7);
  ctx.lineTo(0, 3);
  ctx.lineTo(-5, 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function shouldRenderWindLabel(item) {
  if (item.label === "Adesso") {
    return false;
  }

  const itemDate = new Date(item.ms);
  if (Number.isNaN(itemDate.getTime()) || itemDate.getMinutes() !== 0) {
    return false;
  }

  return itemDate.getHours() % 2 === 0;
}

function getWindChartMaximum(values) {
  const maximum = Math.max(...values.map((value) => Number(value)).filter(Number.isFinite), 0);
  if (maximum <= 40) return 40;
  if (maximum <= 80) return Math.ceil(maximum / 10) * 10;
  return Math.ceil(maximum / 25) * 25;
}

function getWindSpeed(point) {
  const value = Number(point?.wind_speed_kph ?? 0);
  return Number.isFinite(value) ? Math.max(value, 0) : 0;
}

function getWindGust(point, fallbackSpeed) {
  const value = Number(point?.wind_gust_kph);
  return Number.isFinite(value) ? Math.max(value, 0) : fallbackSpeed;
}

function getWindDirection(point) {
  const value = Number(point?.wind_direction);
  return Number.isFinite(value) ? value : null;
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

function formatSpeed(value) {
  const numericValue = Number(value);
  return `${Number.isFinite(numericValue) ? Math.round(numericValue) : 0} km/h`;
}

function formatDirection(direction, label) {
  const directionValue = Number(direction);
  const degreeLabel = Number.isFinite(directionValue) ? `${Math.round(directionValue)} gradi` : "n/d";
  return label ? `${label} (${degreeLabel})` : degreeLabel;
}
