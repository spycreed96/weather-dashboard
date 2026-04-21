import { DEFAULT_TEMPERATURE_PALETTE, gradientFillPlugin } from "../utils/chart-gradient.js";
import { convertTemperatureValue } from "../utils/chart-helpers.js";
import {
  formatDetailTemperature,
  getTemperatureUnitCharacter,
  getWeatherIconUrl,
  shouldShowTemperatureDegree,
} from "../utils/weather-formatters.js";

export function initForecastDayChart(day, unit = "celsius") {
  const canvas = document.getElementById("forecast-day-chart-canvas");
  if (!canvas || typeof Chart === "undefined") return null;
  if (!day) return null;

  const hourly = Array.isArray(day.hourly_forecast) ? day.hourly_forecast : [];

  function getCurrentTimeLabel() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  const tempData = hourly
    .map((point) => {
      const meta = { ...point };

      if (typeof meta.time_label === "string" && meta.time_label.trim().toLowerCase() === "adesso") {
        meta.time_label = getCurrentTimeLabel();
        meta.is_now = true;
      }

      let x = null;
      if (meta.time_label && day?.date) {
        if (/^\d{1,2}:\d{2}$/.test(meta.time_label)) {
          x = `${day.date}T${meta.time_label}:00`;
        } else if (meta.is_now) {
          x = new Date().toISOString();
        }
      } else if (meta.iso_time) {
        x = meta.iso_time;
      }

      return {
        x: x || new Date().toISOString(),
        y: meta.temperature != null ? convertTemperatureValue(meta.temperature, unit) : null,
        __meta: meta,
      };
    })
    .filter((point) => !(point.__meta && point.__meta.is_now));

  if (!tempData.length) {
    return null;
  }

  if (canvas._chartInstance) canvas._chartInstance.destroy();
  const ctx = canvas.getContext("2d");

  const labelItems = tempData.map((point) => {
    const ms = typeof point.x === "string" ? Date.parse(point.x) : Number(point.x);
    const iconUrl = getWeatherIconUrl(point.__meta?.icon || "", "2x");
    const img = iconUrl ? new Image() : null;

    if (img) {
      img.src = iconUrl;
    }

    return {
      ms,
      img,
      temperature: point.__meta?.temperature,
      raw: point.__meta,
    };
  });

  const yValues = tempData
    .map((point) => Number(point.y))
    .filter((value) => Number.isFinite(value));
  const yScaleConfig = getChartTemperatureScale(yValues, unit);

  const hourlyLabelsPlugin = {
    id: "hourlyLabels",
    afterDraw(chart) {
      const xScale = chart.scales?.x;
      if (!xScale || !chart.chartArea) return;

      const chartArea = chart.chartArea;
      const drawAreaTop = chartArea.top;
      const paddingTop = chart.options.layout?.padding?.top || 0;
      const ctx2 = chart.ctx;
      const rootStyles = getComputedStyle(document.documentElement);

      ctx2.save();
      ctx2.textAlign = "center";
      ctx2.textBaseline = "middle";

      const timeFontSize = 12;
      const tempFontSize = 13;
      const timeFont = `${timeFontSize}px system-ui, Arial`;
      const tempFont = `700 ${tempFontSize}px system-ui, Arial`;
      const timeY = drawAreaTop - Math.round(paddingTop * 0.75);
      const iconY = drawAreaTop - Math.round(paddingTop * 0.55);
      const tempY = drawAreaTop - Math.round(paddingTop * 0.35);
      const isDark = document.body.classList.contains("dark");
      const cssMuted = (rootStyles.getPropertyValue("--muted") || "").trim();
      const defaultTimeColor = isDark ? "#ffffff" : "#0f172a";
      const tempColor = (rootStyles.getPropertyValue("--accent") || "").trim() || "#ffd684";
      const timeStroke = isDark ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)";

      let axisLabelColor = "";
      try {
        const svgNS = "http://www.w3.org/2000/svg";
        const tempSvg = document.createElementNS(svgNS, "svg");
        tempSvg.style.position = "absolute";
        tempSvg.style.left = "-9999px";
        const tempText = document.createElementNS(svgNS, "text");
        tempText.setAttribute("class", "forecast-chart-axis-label");
        tempText.textContent = "x";
        tempSvg.appendChild(tempText);
        document.body.appendChild(tempSvg);
        axisLabelColor = getComputedStyle(tempText).getPropertyValue("fill") || "";
        document.body.removeChild(tempSvg);
      } catch (error) {
        axisLabelColor = "";
      }

      const timeColor = (axisLabelColor || cssMuted || defaultTimeColor).trim();

      labelItems.forEach((item) => {
        if (!item.ms) return;

        const x = xScale.getPixelForValue(item.ms);
        if (x < chartArea.left - 40 || x > chartArea.right + 40) return;

        let timeText = "";
        try {
          timeText =
            typeof luxon !== "undefined"
              ? luxon.DateTime.fromMillis(item.ms).toFormat("HH:mm")
              : new Date(item.ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        } catch (error) {
          timeText = new Date(item.ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        }

        const pointDate = new Date(item.ms);
        const hour = pointDate.getHours();
        const minutes = pointDate.getMinutes();
        const labelHourStep = getHourlyLabelHourStep();
        const shouldRenderLabel = minutes === 0 && hour % labelHourStep === 0;

        if (shouldRenderLabel) {
          ctx2.font = timeFont;
          ctx2.fillStyle = timeColor;
          ctx2.lineWidth = 2;
          ctx2.strokeStyle = timeStroke;
          ctx2.strokeText(timeText, x, timeY);
          ctx2.fillText(timeText, x, timeY);
          ctx2.lineWidth = 1;
        }

        if (shouldRenderLabel) {
          if (item.img && item.img.complete) {
            const size = 28;
            ctx2.drawImage(item.img, Math.round(x - size / 2), Math.round(iconY - size / 2), size, size);
          } else if (item.img) {
            item.img.onload = () => chart.draw();
          }

          const temperatureLabel = formatDetailTemperature(item.temperature, unit);
          ctx2.font = tempFont;
          ctx2.fillStyle = tempColor;
          ctx2.fillText(temperatureLabel, x, tempY);
        }
      });

      ctx2.restore();
    },
  };

  const config = {
    type: "line",
    data: {
      datasets: [
        {
          label: `Temperatura (${unit === "celsius" ? "°C" : "°F"})`,
          data: tempData,
          borderColor: "rgba(246, 246, 242, 0.96)",
          backgroundColor: "rgba(255, 213, 138, 0.24)",
          borderWidth: 0,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: (context) => (context.raw?.__meta?.is_now ? 0 : 6),
          hitRadius: (context) => (context.raw?.__meta?.is_now ? 0 : 8),
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      layout: { padding: { top: 150 } },
      plugins: {
        gradientFillPlugin: {
          alpha: 0.34,
          palette: DEFAULT_TEMPERATURE_PALETTE,
          useChroma: typeof window !== "undefined" && typeof window.chroma === "function",
        },
        title: { display: false },
        legend: { display: false },
        tooltip: {
          enabled: true,
          filter(context) {
            const raw = context.raw || {};
            const timeLabel = String((raw.__meta && raw.__meta.time_label) || "").toLowerCase();
            return !(raw.__meta?.is_now || timeLabel === "adesso");
          },
          callbacks: {
            title(items) {
              if (!items.length) return "";

              const ms = items[0].parsed.x;
              try {
                return luxon.DateTime.fromMillis(ms).toFormat("HH:mm dd/LL/yyyy");
              } catch (error) {
                return new Date(ms).toLocaleString();
              }
            },
            label(item) {
              const rawTemperature = item.raw?.__meta?.temperature;
              return `${item.dataset.label}: ${formatDetailTemperature(rawTemperature ?? item.parsed.y, unit)}`;
            },
          },
        },
      },
      scales: {
        x: {
          type: "time",
          position: "top",
          time: { unit: "hour", displayFormats: { hour: "HH:mm" } },
          title: { display: false },
          grid: { display: false, drawBorder: false },
          ticks: { display: false },
        },
        y: {
          beginAtZero: false,
          bounds: "ticks",
          min: yScaleConfig.min,
          max: yScaleConfig.max,
          title: { display: false },
          ticks: {
            callback: (value) => formatChartAxisTemperature(value, unit),
            maxTicksLimit: yScaleConfig.maxTicksLimit,
            stepSize: yScaleConfig.stepSize,
          },
          grid: { display: false },
        },
      },
    },
    plugins: [hourlyLabelsPlugin, gradientFillPlugin],
  };

  const chart = new Chart(ctx, config);
  canvas._chartInstance = chart;
  return chart;
}

function getChartTemperatureScale(values, unit = "celsius") {
  const basePadding = unit === "fahrenheit" ? 4 : 2;
  const maxTicksLimit = 6;

  if (!values.length) {
    return {
      min: unit === "fahrenheit" ? 28 : -2,
      max: unit === "fahrenheit" ? 44 : 6,
      maxTicksLimit,
      stepSize: unit === "fahrenheit" ? 4 : 2,
    };
  }

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const dynamicPadding = Math.max(basePadding, Math.ceil((maxValue - minValue) * 0.2));

  let min = Math.floor(minValue - dynamicPadding);
  let max = Math.ceil(maxValue + dynamicPadding);

  if (min === max) {
    min -= basePadding;
    max += basePadding;
  }

  const stepSize = getNiceTemperatureStep((max - min) / (maxTicksLimit - 1));
  min = Math.floor(min / stepSize) * stepSize;
  max = Math.ceil(max / stepSize) * stepSize;

  if (min === max) {
    max += stepSize;
  }

  return {
    min,
    max,
    maxTicksLimit,
    stepSize,
  };
}

function getNiceTemperatureStep(targetStep) {
  const safeTarget = Math.max(targetStep, 1);
  const magnitude = 10 ** Math.floor(Math.log10(safeTarget));
  const normalized = safeTarget / magnitude;

  if (normalized <= 1) {
    return magnitude;
  }

  if (normalized <= 2) {
    return 2 * magnitude;
  }

  if (normalized <= 3) {
    return 3 * magnitude;
  }

  if (normalized <= 5) {
    return 5 * magnitude;
  }

  return 10 * magnitude;
}

function formatChartAxisTemperature(value, unit = "celsius") {
  const roundedValue = Math.round(Number(value));

  if (!Number.isFinite(roundedValue)) {
    return "";
  }

  return `${roundedValue}${shouldShowTemperatureDegree(unit) ? "°" : getTemperatureUnitCharacter(unit)}`;
}

function getHourlyLabelHourStep() {
  if (typeof window === "undefined") {
    return 2;
  }

  return window.innerWidth <= 640 ? 4 : 2;
}
