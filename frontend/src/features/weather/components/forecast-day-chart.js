export function initForecastDayChart(day, unit = "celsius") {
  const canvas = document.getElementById("forecast-day-chart-canvas");
  if (!canvas || typeof Chart === "undefined") return null;
  if (!day) return null;

  const hourly = Array.isArray(day.hourly_forecast) ? day.hourly_forecast : [];

  const tempData = hourly.map((p) => {
    let x = null;
    if (p.time_label && day?.date) {
      if (/^\d{1,2}:\d{2}$/.test(p.time_label)) {
        x = `${day.date}T${p.time_label}:00`;
      } else if (p.is_now) {
        x = new Date().toISOString();
      }
    } else if (p.iso_time) {
      x = p.iso_time;
    }
    return { x: x || new Date().toISOString(), y: p.temperature != null ? Number(p.temperature) : null };
  });

  if (canvas._chartInstance) canvas._chartInstance.destroy();
  const ctx = canvas.getContext("2d");

  const config = {
    type: 'line',
    data: { datasets: [
      {
        label: `Temperatura (${unit === 'celsius' ? '°C' : '°F'})`,
        data: tempData,
        borderColor: 'rgba(255,99,132,1)',
        backgroundColor: 'rgba(255,99,132,0.2)',
        borderWidth: 3,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 6,
        hitRadius: 8,
        fill: true,
      }
    ] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        title: { display: false },
        legend: { display: false },
        tooltip: {
          callbacks: {
            title(items) {
              if (!items.length) return '';
              const ms = items[0].parsed.x;
              try { return luxon.DateTime.fromMillis(ms).toFormat('HH:mm dd/LL/yyyy'); } catch (e) { return new Date(ms).toLocaleString(); }
            },
            label(item) {
              const y = item.parsed.y;
              return `${item.dataset.label}: ${y}°`;
            }
          }
        }
      },
      scales: {
        x: { type: 'time', time: { unit: 'hour', displayFormats: { hour: 'HH:mm' } }, title: { display: false }, grid: { display: false } },
        y: { beginAtZero: false, title: { display: false }, ticks: { callback: (v) => `${v}°` }, grid: { display: false } }
      }
    }
  };

  // eslint-disable-next-line no-undef
  const chart = new Chart(ctx, config);
  canvas._chartInstance = chart;
  return chart;
}
