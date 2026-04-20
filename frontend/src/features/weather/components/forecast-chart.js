export function initWeatherInsightsChart(elements, state) {
  const canvas = document.getElementById("weather-insights-chart-canvas");
  if (!canvas || typeof Chart === "undefined") return null;

  // find today's forecast (match by same local date)
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const selectedDay = (state.forecastData || []).find((d) => d.date === state.selectedForecastDate) || (state.forecastData || []).find((d) => d.date === todayIso) || (state.forecastData || [])[0] || null;
  const hourly = Array.isArray(selectedDay?.hourly_forecast) ? selectedDay.hourly_forecast : [];

  // build time-based dataset: {x: ISO, y: temperature}
  const tempData = hourly.map((p) => {
    // try to build ISO from day.date + time_label when possible
    let x = null;
    if (p.time_label && selectedDay?.date) {
      // time_label may be "HH:MM" or 'Adesso'
      if (/^\d{1,2}:\d{2}$/.test(p.time_label)) {
        x = `${selectedDay.date}T${p.time_label}:00`;
      } else if (p.is_now) {
        x = new Date().toISOString();
      }
    } else if (p.iso_time) {
      x = p.iso_time;
    }

    return { x: x || new Date().toISOString(), y: p.temperature != null ? Number(p.temperature) : null };
  });

  // cleanup existing chart
  if (canvas._chartInstance) {
    canvas._chartInstance.destroy();
  }

  const ctx = canvas.getContext("2d");

  const config = {
    type: "line",
    data: {
      datasets: [
        {
          label: "Temperatura (°C)",
          data: tempData,
          borderColor: "rgba(45,144,255,1)",
          backgroundColor: "rgba(45,144,255,0.14)",
          borderWidth: 2,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 6,
          hitRadius: 8,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title(items) {
              if (!items.length) return "";
              const ms = items[0].parsed.x;
              try {
                return luxon.DateTime.fromMillis(ms).toFormat("HH:mm dd/LL/yyyy");
              } catch (e) {
                return new Date(ms).toLocaleString();
              }
            },
            label(item) {
              const y = item.parsed.y;
              return `${item.dataset.label}: ${y}°`;
            },
          },
        },
      },
      scales: {
        x: {
          type: "time",
          time: { unit: "hour", displayFormats: { hour: "HH:mm" } },
          title: { display: true, text: "Tempo" },
          ticks: { padding: 6 },
          grid: { display: false },
        },
        y: {
          beginAtZero: false,
          title: { display: true, text: "Temperatura (°C)" },
          ticks: { callback: (v) => `${v}°` },
          grid: { display: false },
        },
      },
    },
  };

  // create chart instance
  // Chart.js will use the global luxon adapter if available
  // eslint-disable-next-line no-undef
  const chart = new Chart(ctx, config);
  canvas._chartInstance = chart;
  return chart;
}
