import { DEFAULT_TEMPERATURE_PALETTE, gradientFillPlugin } from "../utils/chart-gradient.js";
import { getWeatherIconUrl, formatDetailTemperature } from "../utils/weather-formatters.js";

export function initForecastDayChart(day, unit = "celsius") {
  const canvas = document.getElementById("forecast-day-chart-canvas");
  if (!canvas || typeof Chart === "undefined") return null;
  if (!day) return null;

  const hourly = Array.isArray(day.hourly_forecast) ? day.hourly_forecast : [];

  // Build dataset for Chart.js (time / temperature)
  function getCurrentTimeLabel() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  const tempData = hourly.map((p) => {
    // clone meta and normalize any literal 'Adesso' labels to current time
    const meta = { ...p };
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

    return { x: x || new Date().toISOString(), y: meta.temperature != null ? Number(meta.temperature) : null, __meta: meta };
  }).filter((d) => !(d.__meta && d.__meta.is_now));

  if (canvas._chartInstance) canvas._chartInstance.destroy();
  const ctx = canvas.getContext("2d");

  // Preload icons
  const labelItems = tempData.map((d) => {
    const ms = typeof d.x === "string" ? Date.parse(d.x) : Number(d.x);
    const iconUrl = getWeatherIconUrl(d.__meta?.icon || "", "2x");
    const img = iconUrl ? new Image() : null;
    if (img) img.src = iconUrl;
    return { ms, img, temperature: d.y, raw: d.__meta };
  });

  const hourlyLabelsPlugin = {
    id: 'hourlyLabels',
    afterDraw(chart) {
      const sc = chart.scales?.x;
      if (!sc) return;
      const chartArea = chart.chartArea;
      const drawAreaTop = chartArea.top;
      const paddingTop = (chart.options.layout && chart.options.layout.padding && chart.options.layout.padding.top) || 0;

      const ctx2 = chart.ctx;
      ctx2.save();
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'middle';
      ctx2.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text') || '#ffffff';
      // fonts and colors
      const rootStyles = getComputedStyle(document.documentElement);

      const timeFontSize = 12;
      const tempFontSize = 13;
      const timeFont = `${timeFontSize}px system-ui, Arial`;
      const tempFont = `700 ${tempFontSize}px system-ui, Arial`;

      // positions inside the top padding area (stacked column)
      const timeY = drawAreaTop - Math.round(paddingTop * 0.75);
      const iconY = drawAreaTop - Math.round(paddingTop * 0.55);
      const tempY = drawAreaTop - Math.round(paddingTop * 0.35);
      const isDark = document.body.classList.contains('dark');
      const cssMuted = (rootStyles.getPropertyValue('--muted') || '').trim();
      const defaultTimeColor = isDark ? '#ffffff' : '#0f172a';

      // try to read the axis label color from CSS by creating a temporary SVG text
      let axisLabelColor = '';
      try {
        const svgNS = 'http://www.w3.org/2000/svg';
        const tempSvg = document.createElementNS(svgNS, 'svg');
        tempSvg.style.position = 'absolute';
        tempSvg.style.left = '-9999px';
        const tempText = document.createElementNS(svgNS, 'text');
        tempText.setAttribute('class', 'forecast-chart-axis-label');
        tempText.textContent = 'x';
        tempSvg.appendChild(tempText);
        document.body.appendChild(tempSvg);
        axisLabelColor = getComputedStyle(tempText).getPropertyValue('fill') || '';
        document.body.removeChild(tempSvg);
      } catch (e) {
        axisLabelColor = '';
      }

      const timeColor = (axisLabelColor || cssMuted || defaultTimeColor).trim();
      const tempColor = (rootStyles.getPropertyValue('--accent') || '').trim() || '#ffd684';
      const timeStroke = isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)';

      labelItems.forEach((item) => {
        if (!item.ms) return;
        const x = sc.getPixelForValue(item.ms);
        if (x < chartArea.left - 40 || x > chartArea.right + 40) return;

        // compute time text (skip drawing the time label for hour 23)
        let timeText = '';
        try {
          timeText = typeof luxon !== 'undefined' ? luxon.DateTime.fromMillis(item.ms).toFormat('HH:mm') : new Date(item.ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
          timeText = new Date(item.ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        const hour = new Date(item.ms).getHours();
        if (hour !== 23) {
          // draw time text with subtle stroke for contrast
          ctx2.font = timeFont;
          ctx2.fillStyle = timeColor;
          ctx2.lineWidth = 2;
          ctx2.strokeStyle = timeStroke;
          ctx2.strokeText(timeText, x, timeY);
          ctx2.fillText(timeText, x, timeY);
          ctx2.lineWidth = 1;
        }

        // icon (centered) and temperature (no background)
        // skip icon/temperature labels for hour 23 to avoid clutter
        if (hour !== 23) {
          if (item.img && item.img.complete) {
            const size = 28;
            ctx2.drawImage(item.img, Math.round(x - size / 2), Math.round(iconY - size / 2), size, size);
          } else if (item.img) {
            item.img.onload = () => chart.draw();
          }

          const tLabel = formatDetailTemperature(item.temperature, unit);
          ctx2.font = tempFont;
          ctx2.fillStyle = tempColor;
          ctx2.fillText(tLabel, x, tempY);
        }
      });

      ctx2.restore();
    }
  };

  const config = {
    type: 'line',
    data: { datasets: [
      {
        label: `Temperatura (${unit === 'celsius' ? '°C' : '°F'})`,
        data: tempData,
        borderColor: 'rgba(246, 246, 242, 0.96)',
        backgroundColor: 'rgba(255, 213, 138, 0.24)',
        borderWidth: 0,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: (ctx) => (ctx.raw && ctx.raw.__meta && ctx.raw.__meta.is_now ? 0 : 6),
        hitRadius: (ctx) => (ctx.raw && ctx.raw.__meta && ctx.raw.__meta.is_now ? 0 : 8),
        fill: true,
      }
    ] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
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
            const tlabel = String((raw.__meta && raw.__meta.time_label) || "").toLowerCase();
            return !(raw.__meta?.is_now || tlabel === "adesso");
          },
          callbacks: {
            title(items) {
              if (!items.length) return "";
              const ms = items[0].parsed.x;
              try {
                return luxon.DateTime.fromMillis(ms).toFormat('HH:mm dd/LL/yyyy');
              } catch (e) {
                return new Date(ms).toLocaleString();
              }
            },
            label(item) {
              const y = item.parsed.y;
              return `${item.dataset.label}: ${y}°`;
            }
          }
        },
      },
      scales: {
        x: {
          type: 'time',
          position: 'top',
          time: { unit: 'hour', displayFormats: { hour: 'HH:mm' } },
          title: { display: false },
          grid: { display: false, drawBorder: false },
          ticks: { display: false }
        },
        y: { beginAtZero: false, title: { display: false }, ticks: { callback: (v) => `${v}°` }, grid: { display: false } }
      }
    }
    ,
    plugins: [ hourlyLabelsPlugin, gradientFillPlugin ]
  };

  // eslint-disable-next-line no-undef
  const chart = new Chart(ctx, config);
  canvas._chartInstance = chart;
  return chart;
}
