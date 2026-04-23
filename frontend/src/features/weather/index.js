import { qs, qsa } from "../../shared/utils/dom.js";
import { bindAppShell, renderAppSidebar } from "../../shared/components/app-shell.js";
import { formatCurrentTime } from "../../shared/utils/format-date.js";
import { renderForecastChart, renderForecastItems } from "./components/forecast-list.js";
import { initForecastDayChart } from "./components/forecast-day-chart.js";
import { renderForecastPanel } from "./components/forecast-panel.js";
import { initPrecipitationForecastChart, renderPrecipitationForecastChart } from "./components/forecast-precipitation-chart.js";
import { initWindForecastChart, renderWindForecastChart } from "./components/forecast-wind-chart.js";
import { renderSearchForm, renderWeatherControls } from "./components/search-form.js";
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
const CITY_SUGGESTION_DEBOUNCE_DELAY = 300;
const CITY_SUGGESTION_LIMIT = 5;
const CITY_SUGGESTION_MIN_LENGTH = 3;
const CITY_SUGGESTION_CACHE_LIMIT = 50;

function createInitialWeatherState() {
  return {
    activeQuery: "Catanzaro",
    activeForecastTab: "overview",
    cityMap: null,
    cityMapCircle: null,
    cityMapMarker: null,
    currentWeather: null,
    debounceTimer: null,
    forecastData: [],
    showFeelsLikeForecast: false,
    precipitationRange: "24h",
    showPrecipitationAccumulation: true,
    showWindGusts: true,
    isRefreshPending: false,
    pendingHistoryLabel: null,
    refreshToastTimer: null,
    selectedForecastDate: null,
    keepSearchInputEmptyOnMount: true,
    suggestionAbortController: null,
    suggestionRequestId: 0,
    suggestionsCache: new Map(),
    temperatureUnit: "celsius",
    weatherRequestId: 0,
  };
}

const weatherState = createInitialWeatherState();
let weatherRuntime = null;

export function mountWeather(root) {
  unmountWeather();

  const controller = new AbortController();
  weatherRuntime = {
    activeHistoryItem: null,
    controller,
    root,
    shellBinding: null,
    timers: new Set(),
  };

  root.innerHTML = `
    ${renderSearchForm()}
    ${renderAppSidebar({ activePage: "forecast" })}
    <div class="app-route-content">
      ${renderWeatherControls()}
      <div class="dashboard-content">
        <p id="current-location" class="current-location">--</p>
        ${renderWeatherCard()}
        ${renderForecastPanel()}
        ${renderWeatherInsightsSection()}
      </div>
    </div>
  `;

  const state = weatherState;
  state.keepSearchInputEmptyOnMount = true;
  const elements = getElements(root);
  weatherRuntime.elements = elements;

  applySavedTheme(elements.themeToggle);
  updateTemperatureUnitButton(elements, state);
  weatherRuntime.shellBinding = bindAppShell(root, {
    onOpen: () => {
      hideSuggestions(elements);
      closeTemperatureSettingsDropdown(elements);
      closeAllHistoryDropdowns();
    },
  });
  bindThemeToggle(elements.themeToggle);
  bindRefreshButton(elements, state);
  bindTemperatureToggle(elements, state);
  bindForecastFeelsLikeToggle(elements, state);
  bindForecastTabs(elements, state);
  bindHistoryNavigation(elements);
  bindHistoryDropdownLayer(elements);
  bindForecastNavigation(elements, state);
  bindSearchInteractions(elements, state);
  bindGlobalInteractions(elements);

  if (state.currentWeather) {
    renderWeather(elements, state, state.currentWeather);
  } else {
    renderForecastPanels(elements, state);
    void fetchAndRenderWeather(state.activeQuery, elements, state);
  }
}

export function unmountWeather() {
  if (!weatherRuntime) {
    return;
  }

  weatherState.weatherRequestId += 1;
  weatherState.suggestionRequestId += 1;
  abortSuggestionRequest(weatherState);
  weatherRuntime.controller.abort();
  weatherRuntime.shellBinding?.destroy?.();
  weatherRuntime.timers.forEach((timerId) => clearTimeout(timerId));
  weatherRuntime.timers.clear();
  weatherRuntime.activeHistoryItem = null;
  clearTimeout(weatherState.debounceTimer);
  clearTimeout(weatherState.refreshToastTimer);
  weatherState.debounceTimer = null;
  weatherState.refreshToastTimer = null;
  weatherState.suggestionAbortController = null;
  weatherState.isRefreshPending = false;
  weatherState.pendingHistoryLabel = null;
  destroyWeatherCharts(weatherRuntime.root);
  destroyCityMap(weatherState);
  weatherRuntime.root.replaceChildren();
  weatherRuntime = null;
}

export const mountWeatherFeature = mountWeather;

function getElements(root) {
  return {
    airQuality: qs("#air-quality", root),
    currentTime: qs("#current-time", root),
    feelsLike: qs("#feels-like", root),
    dewPoint: qs("#dew-point", root),
    forecastChart: qs("#forecast-chart", root),
    forecastFeelsLikeToggle: qs("#forecast-feels-like-toggle", root),
    forecastList: qs("#daily-forecast-list", root),
    forecastNext: qs("#forecast-next", root),
    forecastPanelCopy: qs(".forecast-panel-copy", root),
    forecastPanelMeta: qs(".forecast-panel-meta", root),
    forecastPanelTitle: qs("#forecast-panel-title", root),
    forecastPrev: qs("#forecast-prev", root),
    forecastTabs: qs(".feature-tabs", root),
    weatherInsightsCards: qs("#weather-insights-cards", root),
    form: qs("#search-form", root),
    historyContainerShell: qs("#history-container-shell", root),
    historyContainer: qs("#history-container", root),
    historyDropdownLayer: qs("#history-dropdown-layer", root),
    historyNav: qs(".history-nav", root),
    historyNext: qs("#history-next", root),
    historyPrev: qs("#history-prev", root),
    historyRemoveButton: qs("#history-remove-button", root),
    humidity: qs("#humidity", root),
    icon: qs("#weather-icon", root),
    input: qs("#city-input", root),
    location: qs("#current-location", root),
    map: qs("#city-map", root),
    mapCopy: qs("#map-copy", root),
    pressure: qs("#pressure", root),
    refreshDashboard: qs("#refresh-dashboard", root),
    refreshToast: qs("#refresh-toast", root),
    searchHeader: qs(".app-header", root),
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

function getWeatherListenerOptions() {
  return weatherRuntime?.controller ? { signal: weatherRuntime.controller.signal } : undefined;
}

function scheduleWeatherTimeout(callback, delay) {
  if (!weatherRuntime) {
    return window.setTimeout(callback, delay);
  }

  const timerId = window.setTimeout(() => {
    weatherRuntime?.timers.delete(timerId);
    callback();
  }, delay);

  weatherRuntime.timers.add(timerId);
  return timerId;
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
  }, getWeatherListenerOptions());
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

    if (!weatherRuntime || weatherRuntime.elements !== elements) {
      return;
    }

    state.isRefreshPending = false;
    setRefreshButtonPendingState(elements, false);

    if (isSuccess) {
      showRefreshToast(elements, state, `Dashboard aggiornata alle ${formatCurrentTime()}`, "success");
      return;
    }

    showRefreshToast(elements, state, "Aggiornamento non riuscito", "error");
  }, getWeatherListenerOptions());
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

  state.refreshToastTimer = scheduleWeatherTimeout(() => {
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
  weatherRuntime?.timers.delete(state.refreshToastTimer);
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
  }, getWeatherListenerOptions());

  elements.temperatureSettingsClose?.addEventListener("click", () => {
    closeTemperatureSettingsDropdown(elements);
  }, getWeatherListenerOptions());

  elements.temperatureOptionFahrenheit?.addEventListener("click", () => {
    applyTemperatureUnitSelection("fahrenheit", elements, state);
  }, getWeatherListenerOptions());

  elements.temperatureOptionCelsius?.addEventListener("click", () => {
    applyTemperatureUnitSelection("celsius", elements, state);
  }, getWeatherListenerOptions());

  updateTemperatureSettingsDropdown(elements, state);
}

function bindForecastFeelsLikeToggle(elements, state) {
  if (!elements.forecastFeelsLikeToggle) {
    return;
  }

  elements.forecastFeelsLikeToggle.addEventListener("click", () => {
    state.showFeelsLikeForecast = !state.showFeelsLikeForecast;
    updateForecastFeelsLikeToggle(elements, state);
    renderSelectedForecastChart(elements, state);
  }, getWeatherListenerOptions());

  updateForecastFeelsLikeToggle(elements, state);
}

function bindForecastTabs(elements, state) {
  if (!elements.forecastTabs) {
    return;
  }

  elements.forecastTabs.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-forecast-tab]");
    if (!tab) {
      return;
    }

    const tabId = tab.dataset.forecastTab;
    if (!["overview", "precipitation", "wind"].includes(tabId) || state.activeForecastTab === tabId) {
      updateForecastTabControls(elements, state);
      return;
    }

    state.activeForecastTab = tabId;
    renderForecastList(elements, state);
    updateForecastSelection(elements, state);
    renderSelectedForecastChart(elements, state);
    updateForecastTabControls(elements, state);
    requestAnimationFrame(() => {
      updateForecastNavState(elements);
    });
  }, getWeatherListenerOptions());

  updateForecastTabControls(elements, state);
}

function updateForecastTabControls(elements, state) {
  qsa("[data-forecast-tab]", elements.forecastTabs || document).forEach((tab) => {
    const isActive = tab.dataset.forecastTab === state.activeForecastTab;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-pressed", String(isActive));
  });

  if (elements.forecastPanelTitle) {
    elements.forecastPanelTitle.textContent = getForecastPanelTitle(state.activeForecastTab);
  }

  if (elements.forecastPanelCopy) {
    elements.forecastPanelCopy.textContent = getForecastPanelCopy(state.activeForecastTab);
  }

  if (elements.forecastPanelMeta) {
    elements.forecastPanelMeta.classList.toggle("is-hidden", state.activeForecastTab !== "overview");
  }
}

function getForecastPanelTitle(tabId) {
  if (tabId === "precipitation") {
    return "Precipitazioni";
  }

  if (tabId === "wind") {
    return "Vento";
  }

  return "Panoramica";
}

function getForecastPanelCopy(tabId) {
  if (tabId === "precipitation") {
    return "Accumuli orari, probabilita' e andamento delle precipitazioni previste.";
  }

  if (tabId === "wind") {
    return "Velocita', raffiche e direzione del vento previste durante la giornata.";
  }

  return "Panello orario con vista termica, trend giornaliero e contesto astronomico.";
}

function updateForecastFeelsLikeToggle(elements, state) {
  if (!elements.forecastFeelsLikeToggle) {
    return;
  }

  const isActive = Boolean(state.showFeelsLikeForecast);
  elements.forecastFeelsLikeToggle.classList.toggle("is-active", isActive);
  elements.forecastFeelsLikeToggle.setAttribute("aria-pressed", String(isActive));
  elements.forecastFeelsLikeToggle.setAttribute(
    "aria-label",
    isActive ? "Nascondi temperatura percepita dal grafico" : "Mostra temperatura percepita nel grafico",
  );
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
      // forecast panel removed: forecastChart, forecastList, forecastNext, forecastPrev
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
    }, getWeatherListenerOptions());
  }

  if (elements.historyNext) {
    elements.historyNext.addEventListener("click", () => {
      closeAllHistoryDropdowns();
      elements.historyContainer.scrollLeft += HISTORY_SCROLL_STEP;
    }, getWeatherListenerOptions());
  }

  window.addEventListener("resize", () => {
    closeAllHistoryDropdowns();
    closeTemperatureSettingsDropdown(elements);
    updateHistoryNavVisibility(elements);
  }, getWeatherListenerOptions());

  elements.historyContainer.addEventListener("scroll", () => {
    closeAllHistoryDropdowns();
    closeTemperatureSettingsDropdown(elements);
  }, getWeatherListenerOptions());
}

function bindHistoryDropdownLayer(elements) {
  if (!elements.historyRemoveButton || !elements.historyContainer) {
    return;
  }

  elements.historyRemoveButton.addEventListener("click", (event) => {
    event.stopPropagation();

    const activeHistoryItem = weatherRuntime?.activeHistoryItem;
    if (!activeHistoryItem || !elements.historyContainer.contains(activeHistoryItem)) {
      closeAllHistoryDropdowns();
      return;
    }

    if (elements.historyContainer.children.length > 1) {
      closeAllHistoryDropdowns();
      activeHistoryItem.remove();
      updateHistoryNavVisibility(elements);
      return;
    }

    closeAllHistoryDropdowns();
  }, getWeatherListenerOptions());
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
  }, getWeatherListenerOptions());

  if (elements.forecastPrev) {
    elements.forecastPrev.addEventListener("click", () => {
      elements.forecastList.scrollBy({
        left: -FORECAST_SCROLL_STEP,
        behavior: "smooth",
      });
    }, getWeatherListenerOptions());
  }

  if (elements.forecastNext) {
    elements.forecastNext.addEventListener("click", () => {
      elements.forecastList.scrollBy({
        left: FORECAST_SCROLL_STEP,
        behavior: "smooth",
      });
    }, getWeatherListenerOptions());
  }

  elements.forecastList.addEventListener("scroll", () => {
    updateForecastNavState(elements);
  }, getWeatherListenerOptions());

  window.addEventListener("resize", () => {
    updateForecastNavState(elements);
  }, getWeatherListenerOptions());

  updateForecastNavState(elements);
}

function bindSearchInteractions(elements, state) {
  elements.input.addEventListener("input", (event) => {
    const query = event.target.value.trim();
    const cacheKey = getSuggestionCacheKey(query);
    const requestId = ++state.suggestionRequestId;

    clearTimeout(state.debounceTimer);
    weatherRuntime?.timers.delete(state.debounceTimer);
    abortSuggestionRequest(state);

    if (query.length < CITY_SUGGESTION_MIN_LENGTH) {
      hideSuggestions(elements);
      return;
    }

    state.debounceTimer = scheduleWeatherTimeout(async () => {
      if (!weatherRuntime || weatherRuntime.elements !== elements || requestId !== state.suggestionRequestId) {
        return;
      }

      const cachedSuggestions = state.suggestionsCache.get(cacheKey);
      if (cachedSuggestions) {
        renderSuggestions(elements, filterSuggestionsForQuery(query, cachedSuggestions));
        return;
      }

      state.suggestionAbortController = new AbortController();

      try {
        const suggestions = await fetchCitySuggestions(query, {
          limit: CITY_SUGGESTION_LIMIT,
          signal: state.suggestionAbortController.signal,
        });

        if (!weatherRuntime || weatherRuntime.elements !== elements || requestId !== state.suggestionRequestId) {
          return;
        }

        const filteredSuggestions = filterSuggestionsForQuery(query, suggestions);
        setSuggestionCacheEntry(state, cacheKey, filteredSuggestions);
        renderSuggestions(elements, filteredSuggestions);
      } catch (error) {
        if (error?.name === "AbortError") {
          return;
        }

        if (!weatherRuntime || weatherRuntime.elements !== elements || requestId !== state.suggestionRequestId) {
          return;
        }

        console.error("Errore suggerimenti:", error);
        hideSuggestions(elements);
      } finally {
        if (state.suggestionAbortController?.signal.aborted || requestId === state.suggestionRequestId) {
          state.suggestionAbortController = null;
        }
      }
    }, CITY_SUGGESTION_DEBOUNCE_DELAY);
  }, getWeatherListenerOptions());

  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const city = elements.input.value.trim();
    if (!city) {
      return;
    }

    cancelPendingSuggestionLookup(state);

    const resolvedQuery = await resolveSubmittedSearchQuery(city, elements, state);
    if (!weatherRuntime || weatherRuntime.elements !== elements) {
      return;
    }

    if (!resolvedQuery) {
      state.pendingHistoryLabel = null;
      showRefreshToast(elements, state, "Nessuna località trovata per questa ricerca.", "error");
      return;
    }

    hideRefreshToast(elements, state);
    state.pendingHistoryLabel = getHistoryDisplayLabel(city);
    state.keepSearchInputEmptyOnMount = true;
    elements.input.value = "";
    hideSuggestions(elements);
    void fetchAndRenderWeather(resolvedQuery, elements, state);
  }, getWeatherListenerOptions());

  elements.suggestions.addEventListener("click", (event) => {
    const item = event.target.closest(".suggestion-item");
    if (!item) {
      return;
    }

    state.pendingHistoryLabel = getHistoryDisplayLabel(item.dataset.city || item.dataset.query || "");
    state.keepSearchInputEmptyOnMount = true;
    elements.input.value = "";
    abortSuggestionRequest(state);
    hideSuggestions(elements);
    void fetchAndRenderWeather(item.dataset.query || item.dataset.city || "Catanzaro", elements, state);
  }, getWeatherListenerOptions());
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
  }, getWeatherListenerOptions());
}

async function fetchAndRenderWeather(city, elements, state) {
  const requestId = ++state.weatherRequestId;

  try {
    const data = await fetchWeather(city);

    if (!weatherRuntime || weatherRuntime.elements !== elements || requestId !== state.weatherRequestId) {
      return false;
    }

    state.activeQuery = city;
    renderWeather(elements, state, data);
    return true;
  } catch (error) {
    if (!weatherRuntime || weatherRuntime.elements !== elements || requestId !== state.weatherRequestId) {
      return false;
    }

    console.error("Errore meteo:", error);
    state.pendingHistoryLabel = null;
    resetWeatherPanel(elements, state);
    return false;
  }
}

function renderWeather(elements, state, data) {
  state.currentWeather = data;
  state.forecastData = data.forecast_days || [];
  if (!state.forecastData.some((day) => day.date === state.selectedForecastDate)) {
    state.selectedForecastDate = getDefaultForecastDate(state.forecastData);
  }

  if (elements.input) {
    elements.input.value = "";
    state.keepSearchInputEmptyOnMount = true;
  }

  const preferredLocationName = getHistoryDisplayLabel(state.pendingHistoryLabel);
  elements.location.textContent = preferredLocationName
    ? formatLocation({ ...data, name: preferredLocationName })
    : formatLocation(data);
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
    renderForecastList(elements, state);
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
  state.keepSearchInputEmptyOnMount = false;
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
    renderForecastList(elements, state);
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
    elements.suggestions.innerHTML = "";
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
  elements.suggestions.innerHTML = "";
  elements.suggestions.style.display = "none";
}

function abortSuggestionRequest(state) {
  state.suggestionAbortController?.abort();
  state.suggestionAbortController = null;
}

function getSuggestionCacheKey(query) {
  return String(query || "").trim().toLowerCase();
}

function setSuggestionCacheEntry(state, cacheKey, suggestions) {
  if (!cacheKey) {
    return;
  }

  if (state.suggestionsCache.has(cacheKey)) {
    state.suggestionsCache.delete(cacheKey);
  }

  state.suggestionsCache.set(cacheKey, suggestions);

  if (state.suggestionsCache.size <= CITY_SUGGESTION_CACHE_LIMIT) {
    return;
  }

  const oldestKey = state.suggestionsCache.keys().next().value;
  if (oldestKey) {
    state.suggestionsCache.delete(oldestKey);
  }
}

function normalizeSuggestionValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function filterSuggestionsForQuery(query, suggestions) {
  const normalizedQuery = normalizeSuggestionValue(query);
  if (normalizedQuery.length < CITY_SUGGESTION_MIN_LENGTH) {
    return [];
  }

  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const firstQueryToken = queryTokens[0] || normalizedQuery;
  const collapsedQuery = normalizedQuery.replaceAll(" ", "");

  return suggestions.filter((suggestion) => {
    const city = normalizeSuggestionValue(suggestion.name);
    const regionCountry = normalizeSuggestionValue(suggestion.region_country);
    const fullName = normalizeSuggestionValue(suggestion.full_name);
    const searchableText = [city, regionCountry, fullName].filter(Boolean).join(" ").trim();
    const searchableTokens = searchableText.split(" ").filter(Boolean);
    const cityTokens = city.split(" ").filter(Boolean);
    const collapsedCity = city.replaceAll(" ", "");
    const collapsedSearchable = searchableText.replaceAll(" ", "");

    const cityMatchesFirstToken = cityTokens.some((token) => token.startsWith(firstQueryToken))
      || city.startsWith(normalizedQuery)
      || collapsedCity.startsWith(collapsedQuery);

    if (!cityMatchesFirstToken) {
      return false;
    }

    return queryTokens.every((token) => searchableTokens.some((candidate) => candidate.startsWith(token)))
      || collapsedSearchable.includes(collapsedQuery);
  });
}

function cancelPendingSuggestionLookup(state) {
  state.suggestionRequestId += 1;
  clearTimeout(state.debounceTimer);
  weatherRuntime?.timers.delete(state.debounceTimer);
  state.debounceTimer = null;
  abortSuggestionRequest(state);
}

async function resolveSubmittedSearchQuery(query, elements, state) {
  const normalizedQuery = getSuggestionCacheKey(query);
  if (normalizedQuery.length < CITY_SUGGESTION_MIN_LENGTH) {
    return query;
  }

  const suggestions = await getSuggestionsForQuery(query, elements, state);
  if (!weatherRuntime || weatherRuntime.elements !== elements) {
    return null;
  }

  if (!suggestions.length) {
    return null;
  }

  const exactSuggestion = suggestions.find((item) => {
    return getSuggestionCacheKey(item.name) === normalizedQuery || getSuggestionCacheKey(item.full_name) === normalizedQuery;
  });

  const resolvedSuggestion = exactSuggestion || suggestions[0];
  return resolvedSuggestion.full_name || resolvedSuggestion.name || query;
}

async function getSuggestionsForQuery(query, elements, state) {
  const cacheKey = getSuggestionCacheKey(query);
  if (!cacheKey || cacheKey.length < CITY_SUGGESTION_MIN_LENGTH) {
    return [];
  }

  const cachedSuggestions = state.suggestionsCache.get(cacheKey);
  if (cachedSuggestions) {
    return filterSuggestionsForQuery(query, cachedSuggestions);
  }

  try {
    const suggestions = await fetchCitySuggestions(query, {
      limit: CITY_SUGGESTION_LIMIT,
    });

    if (!weatherRuntime || weatherRuntime.elements !== elements) {
      return [];
    }

    const filteredSuggestions = filterSuggestionsForQuery(query, suggestions);
    setSuggestionCacheEntry(state, cacheKey, filteredSuggestions);
    return filteredSuggestions;
  } catch (error) {
    console.error("Errore suggerimenti submit:", error);
    return [];
  }
}

function getHistoryDisplayLabel(value) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) {
    return "";
  }

  if (/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(normalizedValue)) {
    return "";
  }

  return formatDisplayCityLabel(normalizedValue.split(",")[0].trim());
}

function formatDisplayCityLabel(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  if (!normalizedValue) {
    return "";
  }

  return normalizedValue.replace(/(^|[\s'-])([a-z])/g, (match, prefix, character) => {
    return `${prefix}${character.toUpperCase()}`;
  });
}

function addToHistory(elements, state, data) {
  const historyDisplayLabel = getHistoryDisplayLabel(state.pendingHistoryLabel) || data.name;
  state.pendingHistoryLabel = null;
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
    cityName: historyDisplayLabel,
    historyQuery,
    iconMarkup,
    temperatureLabel: formatTemperature(data.temperature, state.temperatureUnit),
    temperatureMarkup: renderDetailInlineTemperature(data.temperature, state.temperatureUnit),
    rawTemperature: data.temperature ?? "",
  });

  historyEntry.menuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleHistoryDropdown(historyEntry.menuButton, historyEntry.item, elements);
  }, getWeatherListenerOptions());

  historyEntry.item.addEventListener("click", () => {
    closeAllHistoryDropdowns();
    state.pendingHistoryLabel = historyDisplayLabel;
    state.keepSearchInputEmptyOnMount = true;
    if (elements.input) {
      elements.input.value = "";
    }
    void fetchAndRenderWeather(historyQuery, elements, state);
  }, getWeatherListenerOptions());

  elements.historyContainer.appendChild(historyEntry.item);

  scheduleWeatherTimeout(() => {
    elements.historyContainer.scrollLeft = elements.historyContainer.scrollWidth;
    updateHistoryNavVisibility(elements);
  }, 100);
}

function closeAllHistoryDropdowns() {
  if (weatherRuntime) {
    weatherRuntime.activeHistoryItem = null;
  }

  qsa(".weather-history-item.is-dropdown-open", document).forEach((item) => {
    item.classList.remove("is-dropdown-open");
  });

  qsa(".history-menu[aria-expanded=\"true\"]", document).forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });

  const dropdownLayer = qs("#history-dropdown-layer");
  if (!dropdownLayer) {
    return;
  }

  dropdownLayer.classList.remove("show");
  dropdownLayer.setAttribute("aria-hidden", "true");
  dropdownLayer.style.removeProperty("left");
  dropdownLayer.style.removeProperty("top");
  dropdownLayer.style.removeProperty("visibility");
}

function toggleHistoryDropdown(menuButton, historyItem, elements) {
  if (!menuButton || !historyItem || !elements.historyDropdownLayer || !elements.historyContainerShell) {
    return;
  }

  const isOpen = weatherRuntime?.activeHistoryItem === historyItem && elements.historyDropdownLayer.classList.contains("show");
  closeAllHistoryDropdowns();

  if (isOpen) {
    return;
  }

  if (weatherRuntime) {
    weatherRuntime.activeHistoryItem = historyItem;
  }

  historyItem.classList.add("is-dropdown-open");
  menuButton.setAttribute("aria-expanded", "true");
  elements.historyDropdownLayer.classList.add("show");
  elements.historyDropdownLayer.setAttribute("aria-hidden", "false");
  positionHistoryDropdown(historyItem, elements.historyDropdownLayer, elements.historyContainerShell);
}

function positionHistoryDropdown(historyItem, dropdownLayer, containerShell) {
  dropdownLayer.style.left = "0px";
  dropdownLayer.style.top = "0px";
  dropdownLayer.style.visibility = "hidden";

  const itemRect = historyItem.getBoundingClientRect();
  const shellRect = containerShell.getBoundingClientRect();
  const dropdownRect = dropdownLayer.getBoundingClientRect();
  let left = itemRect.right - shellRect.left - dropdownRect.width;
  const top = itemRect.bottom - shellRect.top;
  const maxLeft = Math.max(0, shellRect.width - dropdownRect.width);

  left = Math.max(0, Math.min(left, maxLeft));

  dropdownLayer.style.left = `${left}px`;
  dropdownLayer.style.top = `${top}px`;
  dropdownLayer.style.visibility = "";
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

function renderForecastList(elements, state) {
  if (!elements.forecastList) {
    return;
  }

  elements.forecastList.innerHTML = renderForecastItems(
    state.forecastData,
    state.selectedForecastDate,
    state.temperatureUnit,
    state.activeForecastTab,
  );
}

function renderForecastPanels(elements, state) {
  updateForecastTabControls(elements, state);
  updateForecastFeelsLikeToggle(elements, state);
  renderSelectedForecastChart(elements, state);
  renderWeatherInsights(elements, state);
}

function renderSelectedForecastChart(elements, state) {
  if (!elements.forecastChart) {
    return;
  }

  const selectedDay = state.forecastData.find((day) => day.date === state.selectedForecastDate) || null;
  if (state.activeForecastTab === "precipitation") {
    elements.forecastChart.innerHTML = renderPrecipitationForecastChart(selectedDay, {
      range: state.precipitationRange,
      showAccumulation: state.showPrecipitationAccumulation,
    });
    try {
      initPrecipitationForecastChart(selectedDay, {
        range: state.precipitationRange,
        showAccumulation: state.showPrecipitationAccumulation,
      });
    } catch (e) { /* ignore */ }
    bindPrecipitationChartControls(elements, state);
    return;
  }

  if (state.activeForecastTab === "wind") {
    elements.forecastChart.innerHTML = renderWindForecastChart(selectedDay, {
      showGusts: state.showWindGusts,
    });
    try {
      initWindForecastChart(selectedDay, {
        showGusts: state.showWindGusts,
      });
    } catch (e) { /* ignore */ }
    bindWindChartControls(elements, state);
    return;
  }

  elements.forecastChart.innerHTML = renderForecastChart(
    selectedDay,
    state.temperatureUnit,
    state.currentWeather,
    state.showFeelsLikeForecast,
  );
  try { initForecastDayChart(selectedDay, state.temperatureUnit, state.showFeelsLikeForecast); } catch (e) { /* ignore */ }
  bindForecastChartInteractions(elements, state);
}

function bindPrecipitationChartControls(elements, state) {
  if (!elements.forecastChart) {
    return;
  }

  qsa("[data-precipitation-range]", elements.forecastChart).forEach((button) => {
    button.addEventListener("click", () => {
      const range = button.dataset.precipitationRange;
      if (!range || state.precipitationRange === range) {
        return;
      }

      state.precipitationRange = range;
      renderSelectedForecastChart(elements, state);
    }, getWeatherListenerOptions());
  });

  const accumulationToggle = qs("[data-precipitation-accumulation]", elements.forecastChart);
  accumulationToggle?.addEventListener("click", () => {
    state.showPrecipitationAccumulation = !state.showPrecipitationAccumulation;
    renderSelectedForecastChart(elements, state);
  }, getWeatherListenerOptions());
}

function bindWindChartControls(elements, state) {
  if (!elements.forecastChart) {
    return;
  }

  const gustToggle = qs("[data-wind-gust-toggle]", elements.forecastChart);
  gustToggle?.addEventListener("click", () => {
    state.showWindGusts = !state.showWindGusts;
    renderSelectedForecastChart(elements, state);
  }, getWeatherListenerOptions());
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

  svg.addEventListener("mousemove", handleMove, getWeatherListenerOptions());
  svg.addEventListener("mouseleave", handleLeave, getWeatherListenerOptions());
  canvas.addEventListener("scroll", handleLeave, getWeatherListenerOptions());
  weatherRuntime?.controller.signal.addEventListener("abort", () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
    }
  }, { once: true });
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
    state.cityMap?.invalidateSize();
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

function destroyWeatherCharts(root) {
  root.querySelectorAll("canvas").forEach((canvas) => {
    if (canvas._chartInstance) {
      canvas._chartInstance.destroy();
      canvas._chartInstance = null;
    }
  });
}

function destroyCityMap(state) {
  if (state.cityMap) {
    state.cityMap.remove();
  }

  state.cityMap = null;
  state.cityMapCircle = null;
  state.cityMapMarker = null;
}
