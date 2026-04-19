import { qs, qsa } from "../../shared/utils/dom.js";
import { formatCurrentTime } from "../../shared/utils/format-date.js";
import { renderForecastChart, renderForecastItems, renderForecastList, renderFeatureTabs } from "./components/forecast-list.js";
import { renderSearchForm } from "./components/search-form.js";
import { renderWeatherInsightsSection, renderWeatherInsightCards } from "./components/weather-insights.js";
import { createHistoryItem } from "./components/weather-details.js";
import { renderWeatherCard } from "./components/weather-card.js";
import { fetchCitySuggestions, fetchWeather } from "./services/weather-api.js";
import {
  capitalizeText,
  formatDetailTemperature,
  formatDetailTemperaturePlaceholder,
  formatTemperaturePlaceholder,
  formatLocation,
  formatTemperature,
  getAirQualityPresentation,
  getWeatherIconUrl,
  renderDetailInlineTemperature,
  renderPrimaryTemperature,
} from "./utils/weather-formatters.js";

const HISTORY_SCROLL_STEP = 200;
const FORECAST_SCROLL_STEP = 260;
const REFRESH_TOAST_HIDE_DELAY = 2800;

export function mountWeatherFeature(root) {
  root.innerHTML = `
    <main class="app-container">
      ${renderSearchForm()}
      <div class="dashboard-content">
        <p id="current-location" class="current-location">--</p>
        ${renderWeatherCard()}
        ${renderFeatureTabs()}
        ${renderForecastList()}
        ${renderWeatherInsightsSection()}
      </div>
    </main>
  `;

  const state = {
    activeQuery: "Catanzaro",
    cityMap: null,
    cityMapCircle: null,
    cityMapMarker: null,
    currentWeather: null,
    debounceTimer: null,
    forecastData: [],
    isRefreshPending: false,
    refreshToastTimer: null,
    selectedForecastDate: null,
    temperatureUnit: "celsius",
  };

  const elements = getElements(root);

  applySavedTheme(elements.themeToggle);
  updateTemperatureUnitButton(elements, state);
  bindThemeToggle(elements.themeToggle);
  bindRefreshButton(elements, state);
  bindTemperatureToggle(elements, state);
  bindHistoryNavigation(elements);
  bindForecastNavigation(elements, state);
  bindSearchInteractions(elements, state);
  bindGlobalInteractions(elements);
  renderForecastPanels(elements, state);
  void fetchAndRenderWeather("Catanzaro", elements, state);
}

function getElements(root) {
  return {
    airQuality: qs("#air-quality", root),
    currentTime: qs("#current-time", root),
    feelsLike: qs("#feels-like", root),
    dewPoint: qs("#dew-point", root),
    forecastChart: qs("#forecast-chart", root),
    forecastList: qs("#daily-forecast-list", root),
    forecastNext: qs("#forecast-next", root),
    forecastPrev: qs("#forecast-prev", root),
    weatherInsightsCards: qs("#weather-insights-cards", root),
    form: qs("#search-form", root),
    historyContainer: qs("#history-container", root),
    historyNav: qs(".history-nav", root),
    historyNext: qs("#history-next", root),
    historyPrev: qs("#history-prev", root),
    humidity: qs("#humidity", root),
    icon: qs("#weather-icon", root),
    input: qs("#city-input", root),
    location: qs("#current-location", root),
    map: qs("#city-map", root),
    mapCopy: qs("#map-copy", root),
    pressure: qs("#pressure", root),
    refreshDashboard: qs("#refresh-dashboard", root),
    refreshToast: qs("#refresh-toast", root),
    searchHeader: qs(".search-header", root),
    suggestions: qs("#suggestions", root),
    temperature: qs("#temperature", root),
    temperatureOptionCelsius: qs("#temperature-option-celsius", root),
    temperatureOptionFahrenheit: qs("#temperature-option-fahrenheit", root),
    temperatureSettingsClose: qs("#temperature-settings-close", root),
    temperatureSettingsDropdown: qs("#temperature-settings-dropdown", root),
    weatherSummary: qs("#weather-summary", root),
    temperatureUnitToggle: qs("#temperature-unit-toggle", root),
    themeToggle: qs("#theme-toggle", root),
    visibility: qs("#visibility", root),
    wind: qs("#wind", root),
  };
}

function applySavedTheme(themeToggle) {
  const savedTheme = localStorage.getItem("theme") || "light";
  const isDark = savedTheme === "dark";
  document.body.classList.toggle("dark", isDark);
  updateThemeToggle(themeToggle, isDark);
}

function bindThemeToggle(themeToggle) {
  if (!themeToggle) {
    return;
  }

  themeToggle.addEventListener("click", () => {
    const isDark = !document.body.classList.contains("dark");
    document.body.classList.toggle("dark", isDark);
    localStorage.setItem("theme", isDark ? "dark" : "light");
    updateThemeToggle(themeToggle, isDark);
  });
}

function bindRefreshButton(elements, state) {
  if (!elements.refreshDashboard || !elements.refreshToast) {
    return;
  }

  elements.refreshDashboard.addEventListener("click", async () => {
    if (state.isRefreshPending) {
      return;
    }

    const query = state.activeQuery || elements.input?.value.trim() || "Catanzaro";
    hideSuggestions(elements);

    state.isRefreshPending = true;
    setRefreshButtonPendingState(elements, true);
    hideRefreshToast(elements, state);

    const isSuccess = await fetchAndRenderWeather(query, elements, state);

    state.isRefreshPending = false;
    setRefreshButtonPendingState(elements, false);

    if (isSuccess) {
      showRefreshToast(elements, state, `Dashboard aggiornata alle ${formatCurrentTime()}`, "success");
      return;
    }

    showRefreshToast(elements, state, "Aggiornamento non riuscito", "error");
  });
}

function setRefreshButtonPendingState(elements, isPending) {
  if (!elements.refreshDashboard) {
    return;
  }

  elements.refreshDashboard.disabled = isPending;
  elements.refreshDashboard.classList.toggle("is-loading", isPending);
  elements.refreshDashboard.setAttribute("aria-busy", String(isPending));
}

function showRefreshToast(elements, state, message, tone) {
  if (!elements.refreshToast) {
    return;
  }

  clearRefreshToastTimer(state);
  elements.refreshToast.textContent = message;
  elements.refreshToast.classList.remove("refresh-toast--success", "refresh-toast--error");
  elements.refreshToast.classList.add("is-visible", `refresh-toast--${tone}`);

  state.refreshToastTimer = setTimeout(() => {
    hideRefreshToast(elements, state);
  }, REFRESH_TOAST_HIDE_DELAY);
}

function hideRefreshToast(elements, state) {
  if (!elements.refreshToast) {
    return;
  }

  clearRefreshToastTimer(state);
  elements.refreshToast.classList.remove("is-visible", "refresh-toast--success", "refresh-toast--error");
  elements.refreshToast.textContent = "";
}

function clearRefreshToastTimer(state) {
  if (!state.refreshToastTimer) {
    return;
  }

  clearTimeout(state.refreshToastTimer);
  state.refreshToastTimer = null;
}

function updateThemeToggle(themeToggle, isDark) {
  if (!themeToggle) {
    return;
  }

  themeToggle.textContent = isDark ? "☀" : "☾";
  themeToggle.setAttribute("aria-pressed", String(isDark));
  themeToggle.setAttribute("aria-label", isDark ? "Passa al tema chiaro" : "Passa al tema scuro");
  themeToggle.setAttribute("title", isDark ? "Passa al tema chiaro" : "Passa al tema scuro");
}

function bindTemperatureToggle(elements, state) {
  if (!elements.temperatureUnitToggle || !elements.temperatureSettingsDropdown) {
    return;
  }

  elements.temperatureUnitToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleTemperatureSettingsDropdown(elements, state);
  });

  elements.temperatureSettingsClose?.addEventListener("click", () => {
    closeTemperatureSettingsDropdown(elements);
  });

  elements.temperatureOptionFahrenheit?.addEventListener("click", () => {
    applyTemperatureUnitSelection("fahrenheit", elements, state);
  });

  elements.temperatureOptionCelsius?.addEventListener("click", () => {
    applyTemperatureUnitSelection("celsius", elements, state);
  });

  updateTemperatureSettingsDropdown(elements, state);
}

function updateTemperatureUnitButton(elements, state) {
  if (!elements.temperatureUnitToggle) {
    return;
  }

  elements.temperatureUnitToggle.textContent = state.temperatureUnit === "celsius" ? "C" : "F";
}

function applyTemperatureUnitSelection(unit, elements, state) {
  if (state.temperatureUnit === unit) {
    updateTemperatureSettingsDropdown(elements, state);
    return;
  }

  state.temperatureUnit = unit;
  updateTemperatureUnitButton(elements, state);
  updateTemperatureSettingsDropdown(elements, state);
  refreshDisplayedTemperatures(elements, state);
}

function updateTemperatureSettingsDropdown(elements, state) {
  const options = [
    { button: elements.temperatureOptionFahrenheit, unit: "fahrenheit" },
    { button: elements.temperatureOptionCelsius, unit: "celsius" },
  ];

  options.forEach(({ button, unit }) => {
    if (!button) {
      return;
    }

    const isActive = state.temperatureUnit === unit;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function closeTemperatureSettingsDropdown(elements) {
  if (!elements.temperatureSettingsDropdown || !elements.temperatureUnitToggle) {
    return;
  }

  elements.temperatureSettingsDropdown.classList.remove("show");
  elements.temperatureSettingsDropdown.setAttribute("aria-hidden", "true");
  elements.temperatureUnitToggle.setAttribute("aria-expanded", "false");
}

function toggleTemperatureSettingsDropdown(elements, state) {
  if (!elements.temperatureSettingsDropdown || !elements.temperatureUnitToggle) {
    return;
  }

  if (elements.temperatureSettingsDropdown.classList.contains("show")) {
    closeTemperatureSettingsDropdown(elements);
    return;
  }

  closeAllHistoryDropdowns();
  updateTemperatureSettingsDropdown(elements, state);
  elements.temperatureSettingsDropdown.classList.add("show");
  elements.temperatureSettingsDropdown.setAttribute("aria-hidden", "false");
  elements.temperatureUnitToggle.setAttribute("aria-expanded", "true");
  positionTemperatureSettingsDropdown(elements.temperatureUnitToggle, elements.temperatureSettingsDropdown);
}

function positionTemperatureSettingsDropdown(toggleButton, dropdown) {
  const spacing = 8;
  const buttonRect = toggleButton.getBoundingClientRect();
  const dropdownRect = dropdown.getBoundingClientRect();

  let left = buttonRect.right - dropdownRect.width;
  let top = buttonRect.bottom + spacing;

  if (left < spacing) {
    left = spacing;
  }

  if (left + dropdownRect.width > window.innerWidth - spacing) {
    left = window.innerWidth - dropdownRect.width - spacing;
  }

  if (top + dropdownRect.height > window.innerHeight - spacing) {
    top = Math.max(spacing, buttonRect.top - dropdownRect.height - spacing);
  }

  dropdown.style.left = `${left}px`;
  dropdown.style.top = `${top}px`;
}

function refreshDisplayedTemperatures(elements, state) {
  if (elements.temperature?.dataset.celsius) {
    updatePrimaryTemperatureDisplay(elements, elements.temperature.dataset.celsius, state.temperatureUnit);
  }

  if (elements.feelsLike?.dataset.celsius) {
    updateInlineDetailTemperature(elements.feelsLike, elements.feelsLike.dataset.celsius, state.temperatureUnit);
  }

  if (elements.dewPoint?.dataset.celsius) {
    updateInlineDetailTemperature(elements.dewPoint, elements.dewPoint.dataset.celsius, state.temperatureUnit);
  }

  qsa(".history-temperature", document).forEach((item) => {
    if (item.dataset.celsius) {
      item.innerHTML = renderDetailInlineTemperature(item.dataset.celsius, state.temperatureUnit);
      item.setAttribute("aria-label", formatTemperature(item.dataset.celsius, state.temperatureUnit));
    }
  });

  qsa(".forecast-temperature-value", document).forEach((item) => {
    if (item.dataset.celsius) {
      item.innerHTML = renderDetailInlineTemperature(item.dataset.celsius, state.temperatureUnit);
      item.setAttribute("aria-label", formatTemperature(item.dataset.celsius, state.temperatureUnit));
    }
  });

  renderForecastPanels(elements, state);
}

function bindHistoryNavigation(elements) {
  if (elements.historyPrev) {
    elements.historyPrev.addEventListener("click", () => {
      closeAllHistoryDropdowns();
      elements.historyContainer.scrollLeft -= HISTORY_SCROLL_STEP;
    });
  }

  if (elements.historyNext) {
    elements.historyNext.addEventListener("click", () => {
      closeAllHistoryDropdowns();
      elements.historyContainer.scrollLeft += HISTORY_SCROLL_STEP;
    });
  }

  window.addEventListener("resize", () => {
    closeAllHistoryDropdowns();
    closeTemperatureSettingsDropdown(elements);
    updateHistoryNavVisibility(elements);
  });

  elements.historyContainer.addEventListener("scroll", () => {
    closeAllHistoryDropdowns();
    closeTemperatureSettingsDropdown(elements);
  });
}

function bindForecastNavigation(elements, state) {
  if (!elements.forecastList) {
    return;
  }

  elements.forecastList.addEventListener("click", (event) => {
    const card = event.target.closest(".forecast-day-card");
    if (!card?.dataset.date) {
      return;
    }

    state.selectedForecastDate = card.dataset.date;
    updateForecastSelection(elements, state);
    renderSelectedForecastChart(elements, state);
  });

  if (elements.forecastPrev) {
    elements.forecastPrev.addEventListener("click", () => {
      elements.forecastList.scrollBy({
        left: -FORECAST_SCROLL_STEP,
        behavior: "smooth",
      });
    });
  }

  if (elements.forecastNext) {
    elements.forecastNext.addEventListener("click", () => {
      elements.forecastList.scrollBy({
        left: FORECAST_SCROLL_STEP,
        behavior: "smooth",
      });
    });
  }

  elements.forecastList.addEventListener("scroll", () => {
    updateForecastNavState(elements);
  });

  window.addEventListener("resize", () => {
    updateForecastNavState(elements);
  });

  updateForecastNavState(elements);
}

function bindSearchInteractions(elements, state) {
  elements.input.addEventListener("input", (event) => {
    clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(async () => {
      const query = event.target.value.trim();
      if (query.length < 2) {
        hideSuggestions(elements);
        return;
      }

      try {
        const suggestions = await fetchCitySuggestions(query);
        renderSuggestions(elements, suggestions);
      } catch (error) {
        console.error("Errore suggerimenti:", error);
        hideSuggestions(elements);
      }
    }, 300);
  });

  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const city = elements.input.value.trim();
    if (!city) {
      return;
    }

    hideSuggestions(elements);
    void fetchAndRenderWeather(city, elements, state);
  });

  elements.suggestions.addEventListener("click", (event) => {
    const item = event.target.closest(".suggestion-item");
    if (!item) {
      return;
    }

    elements.input.value = item.dataset.city || "";
    hideSuggestions(elements);
    void fetchAndRenderWeather(item.dataset.query || item.dataset.city || "Catanzaro", elements, state);
  });
}

function bindGlobalInteractions(elements) {
  document.addEventListener("click", (event) => {
    if (!elements.searchHeader.contains(event.target)) {
      hideSuggestions(elements);
    }

    if (
      elements.temperatureSettingsDropdown &&
      elements.temperatureUnitToggle &&
      !elements.temperatureSettingsDropdown.contains(event.target) &&
      !elements.temperatureUnitToggle.contains(event.target)
    ) {
      closeTemperatureSettingsDropdown(elements);
    }

    if (!event.target.closest(".weather-history-item")) {
      closeAllHistoryDropdowns();
    }
  });
}

async function fetchAndRenderWeather(city, elements, state) {
  try {
    const data = await fetchWeather(city);
    state.activeQuery = city;
    renderWeather(elements, state, data);
    return true;
  } catch (error) {
    console.error("Errore meteo:", error);
    resetWeatherPanel(elements, state);
    return false;
  }
}

function renderWeather(elements, state, data) {
  state.currentWeather = data;
  state.forecastData = data.forecast_days || [];
  state.selectedForecastDate = getDefaultForecastDate(state.forecastData);

  elements.location.textContent = formatLocation(data);
  elements.temperature.dataset.celsius = data.temperature ?? "";
  updatePrimaryTemperatureDisplay(elements, data.temperature, state.temperatureUnit);
  elements.weatherSummary.textContent = formatWeatherSummary(data.description);
  elements.currentTime.textContent = formatCurrentTime();
  elements.feelsLike.dataset.celsius = data.feels_like ?? "";
  updateInlineDetailTemperature(elements.feelsLike, data.feels_like, state.temperatureUnit);
  elements.dewPoint.dataset.celsius = data.dew_point ?? "";
  updateInlineDetailTemperature(elements.dewPoint, data.dew_point, state.temperatureUnit);
  elements.wind.textContent = `${data.wind_speed || "--"} km/h`;
  elements.humidity.textContent = `${data.humidity || "--"}%`;
  elements.visibility.textContent = `${data.visibility || "--"} km`;
  elements.pressure.textContent = `${data.pressure || "--"} hPa`;

  const airQuality = getAirQualityPresentation(data.air_quality);
  elements.airQuality.innerHTML = `<span class="air-quality-dot ${airQuality.className}"></span><span>${airQuality.text}</span>`;

  const iconUrl = getWeatherIconUrl(data.icon, "2x");
  elements.icon.innerHTML = iconUrl
    ? `<img src="${iconUrl}" alt="Weather icon" />`
    : "<span>Cloud</span>";

  if (elements.forecastList) {
    elements.forecastList.innerHTML = renderForecastItems(state.forecastData, state.selectedForecastDate, state.temperatureUnit);
    updateForecastSelection(elements, state);
    requestAnimationFrame(() => {
      updateForecastNavState(elements);
    });
  }

  renderForecastPanels(elements, state);

  updateCityMap(elements, state, data);
  addToHistory(elements, state, data);
}

function resetWeatherPanel(elements, state) {
  state.currentWeather = null;
  state.forecastData = [];
  state.selectedForecastDate = null;
  elements.location.textContent = "--";
  elements.temperature.dataset.celsius = "";
  updatePrimaryTemperatureDisplay(elements, null, state.temperatureUnit);
  elements.weatherSummary.textContent = "--";
  elements.currentTime.textContent = "--:--";
  elements.airQuality.textContent = "--";
  elements.wind.textContent = "-- km/h";
  elements.humidity.textContent = "--%";
  elements.feelsLike.dataset.celsius = "";
  updateInlineDetailTemperature(elements.feelsLike, null, state.temperatureUnit);
  elements.dewPoint.dataset.celsius = "";
  updateInlineDetailTemperature(elements.dewPoint, null, state.temperatureUnit);
  elements.visibility.textContent = "-- km";
  elements.pressure.textContent = "-- hPa";
  elements.icon.textContent = "--";

  if (elements.forecastList) {
    elements.forecastList.innerHTML = renderForecastItems([], "", "celsius");
    updateForecastNavState(elements);
  }

  renderForecastPanels(elements, state);

  if (elements.mapCopy) {
    elements.mapCopy.textContent = "Vista geografica centrata sulla citta corrente";
  }
}

function updatePrimaryTemperatureDisplay(elements, value, unit) {
  if (!elements.temperature) {
    return;
  }

  elements.temperature.innerHTML = renderPrimaryTemperature(value, unit);
  elements.temperature.setAttribute(
    "aria-label",
    value === undefined || value === null || value === ""
      ? formatTemperaturePlaceholder(unit)
      : formatTemperature(value, unit),
  );
  elements.temperature.classList.toggle("temperature--fahrenheit", unit === "fahrenheit");
}

function updateInlineDetailTemperature(element, value, unit) {
  if (!element) {
    return;
  }

  element.innerHTML = renderDetailInlineTemperature(value, unit);
  element.setAttribute(
    "aria-label",
    value === undefined || value === null || value === ""
      ? formatDetailTemperaturePlaceholder(unit)
      : formatDetailTemperature(value, unit),
  );
}

function formatWeatherSummary(description) {
  return description ? capitalizeText(description) : "--";
}

function renderSuggestions(elements, suggestions) {
  if (!suggestions.length) {
    hideSuggestions(elements);
    return;
  }

  elements.suggestions.innerHTML = suggestions
    .map(
      (item) => `
        <div class="suggestion-item" data-city="${item.name}" data-query="${item.full_name}">
          <div class="suggestion-city">${item.name}</div>
          <div class="suggestion-region">${item.region_country}</div>
        </div>
      `
    )
    .join("");

  elements.suggestions.style.display = "block";
}

function hideSuggestions(elements) {
  elements.suggestions.style.display = "none";
}

function addToHistory(elements, state, data) {
  const historyQuery = data.country ? `${data.name}, ${data.country}` : data.name;
  const cityKey = historyQuery.trim().toLowerCase();

  if (elements.historyContainer.querySelector(`[data-city-key="${cityKey}"]`)) {
    return;
  }

  const compactIconUrl = getWeatherIconUrl(data.icon, "");
  const iconMarkup = compactIconUrl
    ? `<img class="responsive-history-img" src="${compactIconUrl}" alt="Weather" />`
    : "<span>Cloud</span>";

  const historyEntry = createHistoryItem({
    cityKey,
    cityName: data.name,
    historyQuery,
    iconMarkup,
    temperatureLabel: formatTemperature(data.temperature, state.temperatureUnit),
    temperatureMarkup: renderDetailInlineTemperature(data.temperature, state.temperatureUnit),
    rawTemperature: data.temperature ?? "",
  });

  historyEntry.menuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleHistoryDropdown(historyEntry.menuButton, historyEntry.dropdown);
  });

  historyEntry.removeButton.addEventListener("click", (event) => {
    event.stopPropagation();
    if (elements.historyContainer.children.length > 1) {
      historyEntry.item.remove();
      updateHistoryNavVisibility(elements);
    }
  });

  historyEntry.item.addEventListener("click", () => {
    void fetchAndRenderWeather(historyQuery, elements, state);
  });

  elements.historyContainer.appendChild(historyEntry.item);

  setTimeout(() => {
    elements.historyContainer.scrollLeft = elements.historyContainer.scrollWidth;
    updateHistoryNavVisibility(elements);
  }, 100);
}

function closeAllHistoryDropdowns() {
  qsa(".history-dropdown.show", document).forEach((dropdown) => {
    dropdown.classList.remove("show");
  });
}

function toggleHistoryDropdown(menuButton, dropdown) {
  if (dropdown.classList.contains("show")) {
    dropdown.classList.remove("show");
    return;
  }

  closeAllHistoryDropdowns();
  dropdown.classList.add("show");
  positionHistoryDropdown(menuButton, dropdown);
}

function positionHistoryDropdown(menuButton, dropdown) {
  const spacing = 8;
  const buttonRect = menuButton.getBoundingClientRect();
  const dropdownRect = dropdown.getBoundingClientRect();

  let left = buttonRect.right - dropdownRect.width;
  let top = buttonRect.bottom + spacing;

  if (left < spacing) {
    left = spacing;
  }

  if (left + dropdownRect.width > window.innerWidth - spacing) {
    left = window.innerWidth - dropdownRect.width - spacing;
  }

  if (top + dropdownRect.height > window.innerHeight - spacing) {
    top = Math.max(spacing, buttonRect.top - dropdownRect.height - spacing);
  }

  dropdown.style.left = `${left}px`;
  dropdown.style.top = `${top}px`;
}

function updateHistoryNavVisibility(elements) {
  const hasOverflow = elements.historyContainer.scrollWidth > elements.historyContainer.clientWidth;
  elements.historyNav.classList.toggle("show", hasOverflow);
}

function updateForecastNavState(elements) {
  if (!elements.forecastList || !elements.forecastPrev || !elements.forecastNext) {
    return;
  }

  const hasOverflow = elements.forecastList.scrollWidth > elements.forecastList.clientWidth + 2;
  const atStart = elements.forecastList.scrollLeft <= 2;
  const atEnd = elements.forecastList.scrollLeft + elements.forecastList.clientWidth >= elements.forecastList.scrollWidth - 2;

  elements.forecastPrev.hidden = !hasOverflow;
  elements.forecastNext.hidden = !hasOverflow;
  elements.forecastPrev.style.display = hasOverflow ? "flex" : "none";
  elements.forecastNext.style.display = hasOverflow ? "flex" : "none";

  elements.forecastPrev.disabled = !hasOverflow || atStart;
  elements.forecastNext.disabled = !hasOverflow || atEnd;
}

function updateForecastSelection(elements, state) {
  if (!elements.forecastList) {
    return;
  }

  qsa(".forecast-day-card", elements.forecastList).forEach((card) => {
    const isSelected = card.dataset.date === state.selectedForecastDate;
    card.classList.toggle("is-active", isSelected);
    card.setAttribute("aria-pressed", String(isSelected));
  });
}

function renderForecastPanels(elements, state) {
  renderSelectedForecastChart(elements, state);
  renderWeatherInsights(elements, state);
}

function renderSelectedForecastChart(elements, state) {
  if (!elements.forecastChart) {
    return;
  }

  const selectedDay = state.forecastData.find((day) => day.date === state.selectedForecastDate) || null;
  elements.forecastChart.innerHTML = renderForecastChart(selectedDay, state.temperatureUnit);
  bindForecastChartInteractions(elements, state);
}

function bindForecastChartInteractions(elements, state) {
  if (!elements?.forecastChart) return;

  const container = elements.forecastChart;
  const canvas = container.querySelector(".forecast-chart-canvas");
  const svg = container.querySelector("svg.forecast-chart-svg");
  const tooltip = container.querySelector(".forecast-chart-tooltip");

  if (!canvas || !svg || !tooltip) return;

  const circles = Array.from(svg.querySelectorAll(".forecast-chart-point"));
  if (!circles.length) return;

  let rafId = null;

  function getSvgCoordsFromClientXY(clientX, clientY) {
    const svgRect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    const x = (clientX - svgRect.left) * (viewBox.width / svgRect.width);
    const y = (clientY - svgRect.top) * (viewBox.height / svgRect.height);
    return { x, y, svgRect };
  }

  function handleMove(evt) {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const { x, y, svgRect } = getSvgCoordsFromClientXY(evt.clientX, evt.clientY);

      let nearest = null;
      let minDist = Infinity;

      circles.forEach((c) => {
        const cx = parseFloat(c.getAttribute("cx") || "0");
        const d = Math.abs(cx - x);
        if (d < minDist) {
          minDist = d;
          nearest = c;
        }
      });

      if (!nearest) return;

      const cx = parseFloat(nearest.getAttribute("cx") || "0");
      const cy = parseFloat(nearest.getAttribute("cy") || "0");
      const canvasRect = canvas.getBoundingClientRect();

      const px = (cx / svg.viewBox.baseVal.width) * svgRect.width;
      const py = (cy / svg.viewBox.baseVal.height) * svgRect.height;

      // coordinates relative to container (pixels)
      const left = svgRect.left - canvasRect.left + px;
      const top = svgRect.top - canvasRect.top + py;

      const timeEl = tooltip.querySelector('.forecast-chart-tooltip-time');
      const iconEl = tooltip.querySelector('.forecast-chart-tooltip-icon');
      const tempEl = tooltip.querySelector('.forecast-chart-tooltip-temp');

      if (timeEl) timeEl.textContent = nearest.dataset.time || "";
      if (iconEl) {
        if (nearest.dataset.icon) {
          iconEl.src = nearest.dataset.icon;
          iconEl.style.display = "block";
        } else {
          iconEl.style.display = "none";
        }
      }
      if (tempEl) tempEl.textContent = nearest.dataset.temp ? formatTemperature(Number(nearest.dataset.temp), state.temperatureUnit) : "";

      // set provisional position (centered on point)
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;

      // make visible but hidden for measurement
      tooltip.style.visibility = "hidden";
      tooltip.classList.add("is-visible");

      // measure and clamp to container bounds to avoid scrollbars
      const ttRect = tooltip.getBoundingClientRect();
      const containerRect = canvas.getBoundingClientRect();
      const halfWidth = ttRect.width / 2;
      const margin = 8; // small padding from edges

      // left is center x within container
      const maxCenterX = containerRect.width - halfWidth - margin;
      const minCenterX = halfWidth + margin;
      const clampedCenterX = Math.max(minCenterX, Math.min(left, maxCenterX));
      tooltip.style.left = `${clampedCenterX}px`;

      // choose above or below depending on space
      const needsBelow = top - ttRect.height - margin < 0;
      tooltip.style.transform = needsBelow ? "translate(-50%, 8px)" : "translate(-50%, -120%)";

      // finally show tooltip
      tooltip.style.visibility = "";

      circles.forEach((c) => c.classList.toggle("is-hover", c === nearest));
    });
  }

  function handleLeave() {
    if (rafId) cancelAnimationFrame(rafId);
    tooltip.classList.remove("is-visible");
    circles.forEach((c) => c.classList.remove("is-hover"));
  }

  svg.addEventListener("mousemove", handleMove);
  svg.addEventListener("mouseleave", handleLeave);
  canvas.addEventListener("scroll", handleLeave);
}

function renderWeatherInsights(elements, state) {
  if (!elements.weatherInsightsCards) {
    return;
  }

  elements.weatherInsightsCards.innerHTML = renderWeatherInsightCards(
    state.currentWeather,
    state.forecastData,
    state.temperatureUnit,
  );
}

function getDefaultForecastDate(forecastDays) {
  if (!forecastDays.length) {
    return null;
  }

  return forecastDays.find((day) => day.label?.toLowerCase() === "oggi")?.date || forecastDays[0].date;
}

function updateCityMap(elements, state, data) {
  if (!elements.map) {
    return;
  }

  if (typeof window.L === "undefined") {
    elements.mapCopy.textContent = "Mappa non disponibile in questo momento";
    return;
  }

  if (data.latitude === undefined || data.longitude === undefined) {
    return;
  }

  initializeCityMap(elements, state);

  if (!state.cityMap) {
    return;
  }

  const coordinates = [data.latitude, data.longitude];
  const mapLabel = formatLocation(data);

  state.cityMap.setView(coordinates, 10, {
    animate: true,
    duration: 0.8,
  });

  if (!state.cityMapMarker) {
    state.cityMapMarker = window.L.marker(coordinates).addTo(state.cityMap);
  } else {
    state.cityMapMarker.setLatLng(coordinates);
  }

  if (!state.cityMapCircle) {
    state.cityMapCircle = window.L.circle(coordinates, {
      radius: 9000,
      color: "#4d7cff",
      fillColor: "#4d7cff",
      fillOpacity: 0.14,
      weight: 2,
    }).addTo(state.cityMap);
  } else {
    state.cityMapCircle.setLatLng(coordinates);
  }

  state.cityMapMarker.bindPopup(mapLabel).openPopup();
  elements.mapCopy.textContent = `Vista geografica centrata su ${mapLabel}`;

  requestAnimationFrame(() => {
    state.cityMap.invalidateSize();
  });
}

function initializeCityMap(elements, state) {
  if (!elements.map || state.cityMap || typeof window.L === "undefined") {
    return;
  }

  state.cityMap = window.L.map(elements.map, {
    attributionControl: true,
    zoomControl: true,
  });

  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(state.cityMap);
}
