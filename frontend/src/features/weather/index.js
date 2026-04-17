import { qs, qsa } from "../../shared/utils/dom.js";
import { formatCurrentTime } from "../../shared/utils/format-date.js";
import { renderForecastChart, renderForecastItems, renderForecastList } from "./components/forecast-list.js";
import { renderSearchForm } from "./components/search-form.js";
import { createHistoryItem } from "./components/weather-details.js";
import { renderWeatherCard } from "./components/weather-card.js";
import { fetchCitySuggestions, fetchWeather } from "./services/weather-api.js";
import {
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

export function mountWeatherFeature(root) {
  root.innerHTML = `
    <main class="app-container">
      ${renderSearchForm()}
      ${renderWeatherCard()}
      ${renderForecastList()}
    </main>
  `;

  const state = {
    cityMap: null,
    cityMapCircle: null,
    cityMapMarker: null,
    debounceTimer: null,
    forecastData: [],
    selectedForecastDate: null,
    temperatureUnit: "celsius",
  };

  const elements = getElements(root);

  applySavedTheme(elements.themeToggle);
  updateTemperatureUnitButton(elements, state);
  bindThemeToggle(elements.themeToggle);
  bindTemperatureToggle(elements, state);
  bindHistoryNavigation(elements);
  bindForecastNavigation(elements, state);
  bindSearchInteractions(elements, state);
  bindGlobalInteractions(elements);
  renderSelectedForecastChart(elements, state);
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
    searchHeader: qs(".search-header", root),
    suggestions: qs("#suggestions", root),
    temperature: qs("#temperature", root),
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

function updateThemeToggle(themeToggle, isDark) {
  if (!themeToggle) {
    return;
  }

  themeToggle.textContent = isDark ? "Dark" : "Light";
  themeToggle.setAttribute("aria-pressed", String(isDark));
}

function bindTemperatureToggle(elements, state) {
  if (!elements.temperatureUnitToggle) {
    return;
  }

  elements.temperatureUnitToggle.addEventListener("click", () => {
    state.temperatureUnit = state.temperatureUnit === "celsius" ? "fahrenheit" : "celsius";
    updateTemperatureUnitButton(elements, state);
    refreshDisplayedTemperatures(elements, state);
  });
}

function updateTemperatureUnitButton(elements, state) {
  if (!elements.temperatureUnitToggle) {
    return;
  }

  elements.temperatureUnitToggle.textContent = state.temperatureUnit === "celsius" ? "C" : "F";
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

  renderSelectedForecastChart(elements, state);
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
    updateHistoryNavVisibility(elements);
  });

  elements.historyContainer.addEventListener("scroll", closeAllHistoryDropdowns);
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

    if (!event.target.closest(".weather-history-item")) {
      closeAllHistoryDropdowns();
    }
  });
}

async function fetchAndRenderWeather(city, elements, state) {
  try {
    const data = await fetchWeather(city);
    renderWeather(elements, state, data);
  } catch (error) {
    console.error("Errore meteo:", error);
    resetWeatherPanel(elements, state);
  }
}

function renderWeather(elements, state, data) {
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

  renderSelectedForecastChart(elements, state);

  updateCityMap(elements, state, data);
  addToHistory(elements, state, data);
}

function resetWeatherPanel(elements, state) {
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

  renderSelectedForecastChart(elements, state);

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
  if (!description) {
    return "--";
  }

  return description.charAt(0).toUpperCase() + description.slice(1);
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
    ? `<img src="${compactIconUrl}" alt="Weather" />`
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

function renderSelectedForecastChart(elements, state) {
  if (!elements.forecastChart) {
    return;
  }

  const selectedDay = state.forecastData.find((day) => day.date === state.selectedForecastDate) || null;
  elements.forecastChart.innerHTML = renderForecastChart(selectedDay, state.temperatureUnit);
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
