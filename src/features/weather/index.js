import { qs, qsa } from "../../shared/utils/dom.js";
import { bindAppShell, renderAppSidebar } from "../../shared/components/app-shell.js";
import { createCitySearchController } from "../../shared/services/city-search-controller.js";
import {
  getHistoryLocationsSnapshot,
  getPrimaryLocationQuery,
  isFavoriteLocationQuery,
  isPrimaryLocationQuery,
  promoteFavoriteToPrimary,
  removeLocationFromStore,
  updateSavedLocationSnapshot,
} from "../../shared/services/favorites-store.js";
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

function createInitialWeatherState() {
  return {
    activeQuery: getPrimaryLocationQuery() || "Catanzaro",
    activeForecastTab: "overview",
    cityMap: null,
    cityMapCircle: null,
    cityMapMarker: null,
    currentWeather: null,
    forecastData: [],
    showFeelsLikeForecast: false,
    precipitationRange: "24h",
    showPrecipitationAccumulation: true,
    showWindGusts: true,
    isRefreshPending: false,
    isHydratingHistoryIcons: false,
    historyIconHydrationRequestId: 0,
    pendingHistoryLabel: null,
    refreshToastTimer: null,
    selectedForecastDate: null,
    keepSearchInputEmptyOnMount: true,
    temperatureUnit: "celsius",
    weatherRequestId: 0,
  };
}

function renderForecastRouteLoader() {
  return `
    <div
      id="forecast-route-loader"
      class="forecast-route-loader"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label="Caricamento previsioni"
      aria-hidden="true"
      hidden
    >
      <div class="forecast-route-loader__spinner" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  `;
}

const weatherState = createInitialWeatherState();
let weatherRuntime = null;

export function mountWeather(root) {
  unmountWeather();

  const state = weatherState;
  syncWeatherStateWithPrimaryLocation(state);
  state.keepSearchInputEmptyOnMount = true;
  const shouldShowRouteLoader = !state.currentWeather;

  const controller = new AbortController();
  weatherRuntime = {
    activeHistoryItem: null,
    controller,
    root,
    searchController: null,
    shellBinding: null,
    timers: new Set(),
  };

  root.innerHTML = `
    ${renderSearchForm()}
    ${renderAppSidebar({ activePage: "forecast" })}
    <div class="app-route-content forecast-route-content">
      ${renderForecastRouteLoader()}
      <div id="forecast-stage" class="forecast-stage"${shouldShowRouteLoader ? " hidden" : ""}>
        ${renderWeatherControls()}
        <div class="dashboard-content">
          <div id="current-location-shell" class="current-location-shell">
            <span
              id="current-location-home"
              class="current-location-home"
              hidden
              aria-hidden="true"
            ></span>
            <p id="current-location" class="current-location">--</p>
          </div>
          ${renderWeatherCard()}
          ${renderForecastPanel()}
          ${renderWeatherInsightsSection()}
        </div>
      </div>
    </div>
  `;

  const elements = getElements(root);
  weatherRuntime.elements = elements;
  setForecastRouteLoadingState(elements, shouldShowRouteLoader);

  applySavedTheme(elements.themeToggle);
  updateTemperatureUnitButton(elements, state);
  weatherRuntime.shellBinding = bindAppShell(root, {
    onOpen: () => {
      hideWeatherSuggestions();
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
  bindHistoryDropdownLayer(elements, state);
  bindForecastNavigation(elements, state);
  bindCurrentLocationPrimaryControl(elements, state);
  bindSearchInteractions(elements, state);
  bindGlobalInteractions(elements);
  renderSavedHistoryLocations(elements, state);
  void hydrateMissingHistoryLocationIcons(elements, state);
  updateCurrentLocationPrimaryControl(elements, state);

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
  weatherState.historyIconHydrationRequestId += 1;
  weatherState.isHydratingHistoryIcons = false;
  weatherRuntime.searchController?.destroy?.();
  weatherRuntime.controller.abort();
  weatherRuntime.shellBinding?.destroy?.();
  weatherRuntime.timers.forEach((timerId) => clearTimeout(timerId));
  weatherRuntime.timers.clear();
  weatherRuntime.activeHistoryItem = null;
  clearTimeout(weatherState.refreshToastTimer);
  weatherState.refreshToastTimer = null;
  weatherState.isRefreshPending = false;
  weatherState.pendingHistoryLabel = null;
  destroyWeatherCharts(weatherRuntime.root);
  destroyCityMap(weatherState);
  weatherRuntime.root.replaceChildren();
  weatherRuntime = null;
}

function getElements(root) {
  return {
    airQuality: qs("#air-quality", root),
    currentTime: qs("#current-time", root),
    feelsLike: qs("#feels-like", root),
    dewPoint: qs("#dew-point", root),
    forecastRouteLoader: qs("#forecast-route-loader", root),
    forecastStage: qs("#forecast-stage", root),
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
    locationHome: qs("#current-location-home", root),
    locationShell: qs("#current-location-shell", root),
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

function hideWeatherSuggestions() {
  weatherRuntime?.searchController?.hideSuggestions?.();
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
    refreshThemeDrivenForecastVisuals();
  }, getWeatherListenerOptions());
}

function refreshThemeDrivenForecastVisuals() {
  if (!weatherRuntime?.elements?.forecastChart || !Array.isArray(weatherState.forecastData) || !weatherState.forecastData.length) {
    return;
  }

  destroyWeatherCharts(weatherRuntime.elements.forecastChart);
  renderSelectedForecastChart(weatherRuntime.elements, weatherState);
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
    hideWeatherSuggestions();

    state.isRefreshPending = true;
    setRefreshButtonPendingState(elements, true);
    hideRefreshToast(elements, state);

    const isSuccess = await fetchAndRenderWeather(query, elements, state, { showRouteLoader: false });

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

function setForecastRouteLoadingState(elements, isLoading) {
  if (!elements.forecastRouteLoader || !elements.forecastStage) {
    return;
  }

  if (isLoading) {
    closeTemperatureSettingsDropdown(elements);
    closeAllHistoryDropdowns();
  }

  elements.forecastRouteLoader.hidden = !isLoading;
  elements.forecastRouteLoader.classList.toggle("is-visible", isLoading);
  elements.forecastRouteLoader.setAttribute("aria-hidden", String(!isLoading));
  elements.forecastRouteLoader.setAttribute("aria-busy", String(isLoading));

  elements.forecastStage.hidden = isLoading;
  elements.forecastStage.setAttribute("aria-hidden", String(isLoading));

  if (!isLoading) {
    syncForecastLayoutAfterReveal(elements);
  }
}

function syncForecastLayoutAfterReveal(elements) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!weatherRuntime || weatherRuntime.elements !== elements || elements.forecastStage?.hidden) {
        return;
      }

      elements.forecastStage.querySelectorAll("canvas").forEach((canvas) => {
        const chartInstance = canvas._chartInstance;
        if (chartInstance && typeof chartInstance.resize === "function") {
          chartInstance.resize();
          if (typeof chartInstance.update === "function") {
            chartInstance.update("none");
          }
        }
      });

      updateHistoryNavVisibility(elements);
      updateForecastNavState(elements);
      weatherState.cityMap?.invalidateSize?.();
    });
  });
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
    return "Accumuli orari, probabilità e andamento delle precipitazioni previste.";
  }

  if (tabId === "wind") {
    return "Velocità, raffiche e direzione del vento previste durante la giornata.";
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

function bindHistoryDropdownLayer(elements, state) {
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

    const targetQuery = String(activeHistoryItem.dataset.query || "").trim();
    const normalizedTargetQuery = normalizeWeatherQuery(targetQuery);

    if (!normalizedTargetQuery) {
      closeAllHistoryDropdowns();
      return;
    }

    const wasPrimary = isPrimaryLocationQuery(targetQuery);
    const wasCurrentLocation = normalizeWeatherQuery(getActiveWeatherQuery(state)) === normalizedTargetQuery;
    const previousPrimaryQuery = normalizeWeatherQuery(getPrimaryLocationQuery());
    const removedLocationLabel = getActionLocationLabel(activeHistoryItem.dataset.city || activeHistoryItem.dataset.query);
    const nextStoreSnapshot = removeLocationFromStore(targetQuery);
    const nextPrimaryQuery = normalizeWeatherQuery(nextStoreSnapshot.primaryLocation?.query);

    closeAllHistoryDropdowns();
    renderSavedHistoryLocations(elements, state);

    if (wasPrimary && nextPrimaryQuery === previousPrimaryQuery) {
      showRefreshToast(elements, state, "Deve esistere sempre almeno una localita principale", "error");
      updateCurrentLocationPrimaryControl(elements, state);
      return;
    }

    if (wasPrimary && wasCurrentLocation && nextPrimaryQuery && nextPrimaryQuery !== normalizedTargetQuery) {
      const nextPrimaryLabel = getActionLocationLabel(nextStoreSnapshot.primaryLocation?.name || nextStoreSnapshot.primaryLocation?.query);
      state.pendingHistoryLabel = getHistoryDisplayLabel(nextStoreSnapshot.primaryLocation?.name)
        || getHistoryDisplayLabel(nextStoreSnapshot.primaryLocation?.query);
      state.keepSearchInputEmptyOnMount = true;
      state.activeQuery = nextStoreSnapshot.primaryLocation.query;
      showRefreshToast(
        elements,
        state,
        `${removedLocationLabel} rimossa. ${nextPrimaryLabel} e ora la localita principale`,
        "success",
      );
      if (elements.input) {
        elements.input.value = "";
      }
      void fetchAndRenderWeather(nextStoreSnapshot.primaryLocation.query, elements, state);
      return;
    }

    if (wasPrimary && nextPrimaryQuery && nextPrimaryQuery !== normalizedTargetQuery) {
      const nextPrimaryLabel = getActionLocationLabel(nextStoreSnapshot.primaryLocation?.name || nextStoreSnapshot.primaryLocation?.query);
      showRefreshToast(
        elements,
        state,
        `${removedLocationLabel} rimossa. ${nextPrimaryLabel} e ora la localita principale`,
        "success",
      );
    } else {
      showRefreshToast(elements, state, `${removedLocationLabel} rimossa dai preferiti`, "success");
    }

    updateCurrentLocationPrimaryControl(elements, state);
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
  weatherRuntime.searchController?.destroy?.();
  weatherRuntime.searchController = createCitySearchController({
    fetchSuggestions: fetchCitySuggestions,
    form: elements.form,
    input: elements.input,
    isStale: () => !weatherRuntime || weatherRuntime.elements !== elements,
    onResolvedSubmit: ({ query, resolvedQuery }) => {
      if (!weatherRuntime || weatherRuntime.elements !== elements) {
        return;
      }

      hideRefreshToast(elements, state);
      state.pendingHistoryLabel = getHistoryDisplayLabel(query);
      state.keepSearchInputEmptyOnMount = true;
      elements.input.value = "";
      hideWeatherSuggestions();
      void fetchAndRenderWeather(resolvedQuery, elements, state);
    },
    onSelectSuggestion: ({ city, query }) => {
      if (!weatherRuntime || weatherRuntime.elements !== elements) {
        return;
      }

      state.pendingHistoryLabel = getHistoryDisplayLabel(city || query);
      state.keepSearchInputEmptyOnMount = true;
      elements.input.value = "";
      hideWeatherSuggestions();
      void fetchAndRenderWeather(query || city || "Catanzaro", elements, state);
    },
    onSuggestionsError: (error) => {
      console.error("Errore suggerimenti:", error);
    },
    onUnresolvedSubmit: () => {
      if (!weatherRuntime || weatherRuntime.elements !== elements) {
        return;
      }

      state.pendingHistoryLabel = null;
      showRefreshToast(elements, state, "Nessuna localita trovata per questa ricerca.", "error");
    },
    signal: weatherRuntime?.controller?.signal,
    suggestions: elements.suggestions,
  });
}

function bindCurrentLocationPrimaryControl(elements, state) {
  if (!elements.locationShell) {
    return;
  }

  const promoteCurrentLocationToPrimary = () => {
    const currentQuery = getActiveWeatherQuery(state);
    if (!state.currentWeather || !currentQuery || isPrimaryLocationQuery(currentQuery) || !isFavoriteLocationQuery(currentQuery)) {
      return;
    }

    const nextStoreSnapshot = promoteFavoriteToPrimary(createFavoriteSnapshotFromWeather(state.currentWeather, currentQuery));
    state.activeQuery = nextStoreSnapshot.primaryLocation.query;
    renderSavedHistoryLocations(elements, state);
    updateCurrentLocationPrimaryControl(elements, state);
    showRefreshToast(
      elements,
      state,
      `${getActionLocationLabel(state.currentWeather?.name || currentQuery)} e ora la localita principale`,
      "success",
    );
  };

  elements.locationShell.addEventListener("click", () => {
    if (!elements.locationShell.classList.contains("is-clickable")) {
      return;
    }

    promoteCurrentLocationToPrimary();
  }, getWeatherListenerOptions());

  elements.locationShell.addEventListener("keydown", (event) => {
    if (!elements.locationShell.classList.contains("is-clickable")) {
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    promoteCurrentLocationToPrimary();
  }, getWeatherListenerOptions());
}

function bindGlobalInteractions(elements) {
  document.addEventListener("click", (event) => {
    if (!elements.searchHeader.contains(event.target)) {
      hideWeatherSuggestions();
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

async function fetchAndRenderWeather(city, elements, state, options = {}) {
  const { showRouteLoader = true } = options;
  const requestId = ++state.weatherRequestId;

  if (showRouteLoader) {
    setForecastRouteLoadingState(elements, true);
  }

  try {
    const data = await fetchWeather(city);

    if (!weatherRuntime || weatherRuntime.elements !== elements || requestId !== state.weatherRequestId) {
      return false;
    }

    state.activeQuery = city;
    renderWeather(elements, state, data);

    if (showRouteLoader) {
      setForecastRouteLoadingState(elements, false);
    }

    return true;
  } catch (error) {
    if (!weatherRuntime || weatherRuntime.elements !== elements || requestId !== state.weatherRequestId) {
      return false;
    }

    console.error("Errore meteo:", error);
    state.pendingHistoryLabel = null;
    resetWeatherPanel(elements, state);

    if (showRouteLoader) {
      setForecastRouteLoadingState(elements, false);
    }

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
  state.pendingHistoryLabel = null;

  const currentQuery = getActiveWeatherQuery(state);
  if (currentQuery && (isPrimaryLocationQuery(currentQuery) || isFavoriteLocationQuery(currentQuery))) {
    updateSavedLocationSnapshot(createFavoriteSnapshotFromWeather(data, currentQuery));
    renderSavedHistoryLocations(elements, state);
  }

  updateCurrentLocationPrimaryControl(elements, state);
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
}

function resetWeatherPanel(elements, state) {
  state.currentWeather = null;
  state.forecastData = [];
  state.keepSearchInputEmptyOnMount = false;
  state.selectedForecastDate = null;
  elements.location.textContent = "--";
  updateCurrentLocationPrimaryControl(elements, state);
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

function getActionLocationLabel(value) {
  return getHistoryDisplayLabel(value) || "La localita selezionata";
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

function createFavoriteSnapshotFromWeather(data, query) {
  const today = data?.forecast_days?.[0] || {};

  return {
    description: capitalizeText(data?.description || "Meteo disponibile"),
    icon: data?.icon ?? null,
    maxTemperature: today.max_temperature ?? data?.temperature ?? null,
    minTemperature: today.min_temperature ?? data?.feels_like ?? null,
    name: formatLocation(data) || query,
    precipitationProbability: today.precipitation_probability ?? 0,
    query,
    temperature: data?.temperature ?? null,
    windSpeed: data?.wind_speed ?? null,
  };
}

function syncWeatherStateWithPrimaryLocation(state) {
  const primaryQuery = getPrimaryLocationQuery() || "Catanzaro";

  if (normalizeWeatherQuery(state.activeQuery) === normalizeWeatherQuery(primaryQuery)) {
    state.activeQuery = primaryQuery;
    return;
  }

  state.activeQuery = primaryQuery;
  state.currentWeather = null;
  state.forecastData = [];
  state.pendingHistoryLabel = null;
  state.selectedForecastDate = null;
}

function normalizeWeatherQuery(value) {
  return String(value || "").trim().toLowerCase();
}

function getActiveWeatherQuery(state) {
  return String(state.activeQuery || "").trim();
}

function renderCurrentLocationHomeIcon() {
  return `
    <svg class="current-location-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3.25a1.9 1.9 0 0 1 1.27.49l6.16 5.55c.42.38.66.92.66 1.49v7.47A2.75 2.75 0 0 1 17.34 21H6.66a2.75 2.75 0 0 1-2.75-2.75v-7.47c0-.57.24-1.11.66-1.49l6.16-5.55A1.9 1.9 0 0 1 12 3.25Zm0 2.21L6.13 10.74v7.51c0 .29.24.53.53.53h2.82v-4.2c0-.92.75-1.67 1.67-1.67h1.7c.92 0 1.67.75 1.67 1.67v4.2h2.82c.29 0 .53-.24.53-.53v-7.51L12 5.46Z" />
    </svg>
  `;
}

function updateCurrentLocationPrimaryControl(elements, state) {
  if (!elements.locationHome || !elements.locationShell) {
    return;
  }

  if (!state.currentWeather) {
    elements.locationShell.classList.remove("current-location-shell--primary", "current-location-shell--favorite", "is-clickable");
    elements.locationShell.removeAttribute("role");
    elements.locationShell.removeAttribute("tabindex");
    elements.locationShell.removeAttribute("aria-label");
    elements.locationShell.removeAttribute("title");
    elements.locationHome.hidden = true;
    elements.locationHome.classList.remove("is-primary");
    elements.locationHome.innerHTML = "";
    return;
  }

  const currentQuery = getActiveWeatherQuery(state);
  const isPrimary = Boolean(currentQuery) && isPrimaryLocationQuery(currentQuery);
  const isFavorite = Boolean(currentQuery) && isFavoriteLocationQuery(currentQuery);

  elements.locationShell.classList.toggle("current-location-shell--primary", isPrimary);
  elements.locationShell.classList.toggle("current-location-shell--favorite", !isPrimary && isFavorite);
  elements.locationShell.classList.toggle("is-clickable", !isPrimary && isFavorite);

  if (!currentQuery || (!isPrimary && !isFavorite)) {
    elements.locationHome.hidden = true;
    elements.locationHome.classList.remove("is-primary");
    elements.locationHome.innerHTML = "";
    elements.locationShell.removeAttribute("role");
    elements.locationShell.removeAttribute("tabindex");
    elements.locationShell.removeAttribute("aria-label");
    elements.locationShell.removeAttribute("title");
    return;
  }

  elements.locationHome.hidden = false;
  elements.locationHome.innerHTML = renderCurrentLocationHomeIcon();
  elements.locationHome.classList.toggle("is-primary", isPrimary);
  if (!isPrimary && isFavorite) {
    elements.locationShell.setAttribute("role", "button");
    elements.locationShell.setAttribute("tabindex", "0");
    elements.locationShell.setAttribute("aria-label", "Imposta questa localita come principale");
    elements.locationShell.setAttribute("title", "Imposta questa localita come principale");
    return;
  }

  elements.locationShell.removeAttribute("role");
  elements.locationShell.removeAttribute("tabindex");
  elements.locationShell.removeAttribute("aria-label");
  elements.locationShell.setAttribute("title", "Localita principale attiva");
}

function renderSavedHistoryLocations(elements, state) {
  if (!elements.historyContainer) {
    return;
  }

  closeAllHistoryDropdowns();
  elements.historyContainer.replaceChildren();

  getHistoryLocationsSnapshot().forEach((location) => {
    const historyQuery = String(location?.query || "").trim();
    if (!historyQuery) {
      return;
    }

    const isPrimaryHistoryItem = isPrimaryLocationQuery(historyQuery);
    const isActiveHistoryItem = normalizeWeatherQuery(getActiveWeatherQuery(state)) === normalizeWeatherQuery(historyQuery);
    const historyDisplayLabel = getHistoryDisplayLabel(location.name) || getHistoryDisplayLabel(historyQuery) || location.name;
    const compactIconUrl = getWeatherIconUrl(location.icon, "");
    const iconMarkup = compactIconUrl
      ? `<img class="responsive-history-img" src="${compactIconUrl}" alt="Weather" />`
      : "";
    const historyEntry = createHistoryItem({
      cityKey: normalizeWeatherQuery(historyQuery),
      cityName: historyDisplayLabel,
      historyQuery,
      iconMarkup,
      isActive: isActiveHistoryItem,
      isPrimary: isPrimaryHistoryItem,
      temperatureLabel: formatTemperature(location.temperature, state.temperatureUnit),
      temperatureMarkup: renderDetailInlineTemperature(location.temperature, state.temperatureUnit),
      rawTemperature: location.temperature ?? "",
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
  });

  elements.historyContainer.scrollLeft = 0;
  updateHistoryNavVisibility(elements);
}

async function hydrateMissingHistoryLocationIcons(elements, state) {
  if (state.isHydratingHistoryIcons) {
    return;
  }

  const activeQuery = normalizeWeatherQuery(getActiveWeatherQuery(state));
  const locationsMissingIcons = getHistoryLocationsSnapshot().filter((location) => {
    const historyQuery = String(location?.query || "").trim();
    return historyQuery && !location.icon && normalizeWeatherQuery(historyQuery) !== activeQuery;
  });

  if (!locationsMissingIcons.length) {
    return;
  }

  const requestId = ++state.historyIconHydrationRequestId;
  state.isHydratingHistoryIcons = true;

  try {
    const results = await Promise.all(locationsMissingIcons.map(async (location) => {
      const historyQuery = String(location.query || "").trim();

      try {
        const data = await fetchWeather(historyQuery);
        updateSavedLocationSnapshot(createFavoriteSnapshotFromWeather(data, historyQuery));
        return true;
      } catch (error) {
        console.warn("History: icona meteo non disponibile", error);
        return false;
      }
    }));

    if (!weatherRuntime || weatherRuntime.elements !== elements || requestId !== state.historyIconHydrationRequestId) {
      return;
    }

    if (results.some(Boolean)) {
      renderSavedHistoryLocations(elements, state);
    }
  } finally {
    if (requestId === state.historyIconHydrationRequestId) {
      state.isHydratingHistoryIcons = false;
    }
  }
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

  updateHistoryDropdownAction(elements, historyItem);
  historyItem.classList.add("is-dropdown-open");
  menuButton.setAttribute("aria-expanded", "true");
  elements.historyDropdownLayer.classList.add("show");
  elements.historyDropdownLayer.setAttribute("aria-hidden", "false");
  positionHistoryDropdown(historyItem, elements.historyDropdownLayer, elements.historyContainerShell);
}

function updateHistoryDropdownAction(elements, historyItem) {
  if (!elements.historyRemoveButton) {
    return;
  }

  const historyQuery = String(historyItem?.dataset?.query || "").trim();
  const isPrimaryTarget = Boolean(historyQuery) && isPrimaryLocationQuery(historyQuery);
  const savedLocationsCount = getHistoryLocationsSnapshot().length;
  const isRemovalBlocked = isPrimaryTarget && savedLocationsCount <= 1;

  if (isRemovalBlocked) {
    elements.historyRemoveButton.textContent = "Mantieni almeno una localita";
  } else if (isPrimaryTarget) {
    elements.historyRemoveButton.textContent = "Rimuovi localita principale";
  } else {
    elements.historyRemoveButton.textContent = "Rimuovi dai preferiti";
  }

  elements.historyRemoveButton.disabled = isRemovalBlocked;
  elements.historyRemoveButton.setAttribute("aria-disabled", String(isRemovalBlocked));
  elements.historyRemoveButton.setAttribute(
    "title",
    isRemovalBlocked
      ? "Deve esistere sempre almeno una localita principale"
      : elements.historyRemoveButton.textContent,
  );
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

function initializeForecastChart(initializeChart, chartType) {
  try {
    initializeChart();
  } catch (error) {
    console.error(`Impossibile inizializzare il grafico forecast "${chartType}".`, error);
  }
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
    initializeForecastChart(() => {
      initPrecipitationForecastChart(selectedDay, {
        range: state.precipitationRange,
        showAccumulation: state.showPrecipitationAccumulation,
      });
    }, "precipitation");
    bindPrecipitationChartControls(elements, state);
    return;
  }

  if (state.activeForecastTab === "wind") {
    elements.forecastChart.innerHTML = renderWindForecastChart(selectedDay, {
      showGusts: state.showWindGusts,
    });
    initializeForecastChart(() => {
      initWindForecastChart(selectedDay, {
        showGusts: state.showWindGusts,
      });
    }, "wind");
    bindWindChartControls(elements, state);
    return;
  }

  elements.forecastChart.innerHTML = renderForecastChart(
    selectedDay,
    state.temperatureUnit,
    state.currentWeather,
    state.showFeelsLikeForecast,
  );
  initializeForecastChart(
    () => initForecastDayChart(selectedDay, state.temperatureUnit, state.showFeelsLikeForecast),
    "overview",
  );
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
