import { bindAppShell, renderAppHeader, renderAppSidebar } from "../../shared/components/app-shell.js";
import { createCitySearchController } from "../../shared/services/city-search-controller.js";
import { fetchCitySuggestions, fetchWeather } from "../weather/services/weather-api.js";
import { capitalizeText, formatLocation } from "../weather/utils/weather-formatters.js";
import {
  renderFavoriteCard,
  renderFavoritesAddPage,
  renderFavoritesAddPreview,
  renderFavoritesEmptyState,
  renderFavoritesPage,
} from "./components/favorites-page.js";

const FAVORITES_STORAGE_KEY = "weather-dashboard-favorite-locations";
const FAVORITES_DEFAULT_VIEW = "overview";

const PRIMARY_FALLBACK = {
  description: "In prevalenza nuvoloso",
  maxTemperature: 19,
  minTemperature: 11,
  name: "Catanzaro, Cal.",
  precipitationProbability: 2,
  query: "Catanzaro",
  temperature: 13,
  windSpeed: 12,
};

const DEFAULT_FAVORITES = [
  {
    description: "In prevalenza nuvoloso",
    maxTemperature: 16,
    minTemperature: 3,
    name: "Aomori, Giappone",
    precipitationProbability: 2,
    query: "Aomori, Japan",
    temperature: 7,
    windSpeed: 8,
  },
  {
    description: "In prevalenza nuvoloso",
    maxTemperature: 29,
    minTemperature: 19,
    name: "Australia, Cuba",
    precipitationProbability: 11,
    query: "Australia, Cuba",
    temperature: 28,
    windSpeed: 16,
  },
  {
    description: "Soleggiato",
    maxTemperature: 26,
    minTemperature: 13,
    name: "Sidney, Stati Uniti d'America",
    precipitationProbability: 69,
    query: "Sidney, United States",
    temperature: 24,
    windSpeed: 14,
  },
  {
    description: "Soleggiato",
    maxTemperature: 17,
    minTemperature: 7,
    name: "Toronto, Canada",
    precipitationProbability: 0,
    query: "Toronto, Canada",
    temperature: 14,
    windSpeed: 7,
  },
  {
    description: "Nuvoloso",
    maxTemperature: 17,
    minTemperature: 8,
    name: "Canepina, Lazio",
    precipitationProbability: 6,
    query: "Canepina, Lazio",
    temperature: 15,
    windSpeed: 22,
  },
  {
    description: "Parzialmente sereno",
    maxTemperature: 19,
    minTemperature: 9,
    name: "Sicili, Campania",
    precipitationProbability: 3,
    query: "Sicili, Campania",
    temperature: 15,
    windSpeed: 12,
  },
  {
    description: "Nuvoloso",
    maxTemperature: 19,
    minTemperature: 9,
    name: "Roma, Laz.",
    precipitationProbability: 59,
    query: "Roma, Lazio",
    temperature: 17,
    windSpeed: 12,
  },
];

function createInitialFavoritesAddState() {
  return {
    candidate: null,
    feedback: "",
    pending: false,
    requestId: 0,
  };
}

function createDefaultFavoritesStore() {
  return {
    favorites: DEFAULT_FAVORITES.map((favorite) => ({ ...favorite })),
    primaryLocation: { ...PRIMARY_FALLBACK },
  };
}

const initialFavoritesStore = loadFavoritesStore();

const favoritesState = {
  addView: createInitialFavoritesAddState(),
  favorites: initialFavoritesStore.favorites,
  feedback: "",
  isHydratingOverview: false,
  overviewRequestId: 0,
  primaryLocation: initialFavoritesStore.primaryLocation,
  syncStatus: "",
};

let favoritesRuntime = null;

export function mountFavorites(root, routeState = null) {
  unmountFavorites();

  const view = resolveFavoritesView(routeState);

  if (!view) {
    window.location.hash = "favorites";
    return;
  }

  const controller = new AbortController();
  favoritesRuntime = {
    controller,
    elements: null,
    root,
    searchController: null,
    shellBinding: null,
    view,
  };

  root.innerHTML = `
    ${renderAppHeader({ title: "Preferiti", activePage: "favorites" })}
    ${renderAppSidebar({ activePage: "favorites" })}
    <div class="app-route-content">
      ${view === "add" ? renderFavoritesAddPage() : renderFavoritesPage({ favoritesCount: favoritesState.favorites.length })}
    </div>
  `;

  const elements = getElements(root);
  favoritesRuntime.elements = elements;
  favoritesRuntime.shellBinding = bindAppShell(root, {
    onOpen: () => {
      hideFavoritesSuggestions();
    },
  });

  bindFavoritesInteractions(root, elements, favoritesState, controller.signal, view);

  if (view === FAVORITES_DEFAULT_VIEW) {
    favoritesState.isHydratingOverview = false;
    favoritesState.syncStatus = "";
    renderFavorites(elements, favoritesState);
    void hydratePrimaryLocation(elements, favoritesState);
    return;
  }

  favoritesState.feedback = "";
  resetFavoritesAddState(favoritesState);
  renderFavoritesAddView(elements, favoritesState);
  bindFavoritesAddSearch(elements, favoritesState);
  window.requestAnimationFrame(() => {
    elements.addInput?.focus();
  });
}

export function unmountFavorites() {
  if (!favoritesRuntime) {
    return;
  }

  favoritesRuntime.searchController?.destroy?.();
  favoritesRuntime.controller.abort();
  favoritesRuntime.shellBinding?.destroy?.();
  favoritesState.isHydratingOverview = false;
  favoritesState.syncStatus = "";
  resetFavoritesAddState(favoritesState);
  favoritesRuntime.root.replaceChildren();
  favoritesRuntime = null;
}

function getElements(root) {
  return {
    addFeedback: root.querySelector("#favorites-add-feedback"),
    addForm: root.querySelector("#favorites-search-form"),
    addInput: root.querySelector("#favorites-city-input"),
    addPreview: root.querySelector("#favorites-add-preview"),
    addSearchShell: root.querySelector("#favorites-search-shell"),
    addSuggestions: root.querySelector("#favorites-suggestions"),
    count: root.querySelector("#favorites-count"),
    feedback: root.querySelector("#favorites-feedback"),
    grid: root.querySelector("#favorites-grid"),
    primaryLocation: root.querySelector("#favorites-primary-location"),
    syncStatus: root.querySelector("#favorites-sync-status"),
  };
}

function bindFavoritesInteractions(root, elements, state, signal, view) {
  root.addEventListener("click", (event) => {
    if (event.target.closest("#favorites-route-back")) {
      hideFavoritesSuggestions();
      window.location.hash = "favorites";
      return;
    }

    if (view === FAVORITES_DEFAULT_VIEW && event.target.closest("#favorites-open-add-route")) {
      state.feedback = "";
      window.location.hash = "favorites/add";
      return;
    }

    if (view !== "add") {
      return;
    }

    if (event.target.closest("#favorites-add-reset")) {
      resetFavoritesAddState(state);
      if (elements.addInput) {
        elements.addInput.value = "";
      }
      hideFavoritesSuggestions();
      renderFavoritesAddView(elements, state);
      elements.addInput?.focus();
      return;
    }

    if (event.target.closest("#favorites-add-confirm")) {
      void confirmAddFavorite(elements, state);
    }
  }, { signal });

  if (view === "add") {
    document.addEventListener("click", (event) => {
      if (!elements.addSearchShell?.contains(event.target)) {
        hideFavoritesSuggestions();
      }
    }, { signal });
  }
}

function bindFavoritesAddSearch(elements, state) {
  favoritesRuntime.searchController?.destroy?.();
  favoritesRuntime.searchController = createCitySearchController({
    fetchSuggestions: fetchCitySuggestions,
    form: elements.addForm,
    input: elements.addInput,
    isStale: () => !isFavoritesViewActive(elements, "add"),
    onResolvedSubmit: ({ resolvedQuery }) => {
      hideFavoritesSuggestions();
      void loadFavoritePreview(resolvedQuery, elements, state);
    },
    onSelectSuggestion: ({ query }) => {
      if (elements.addInput) {
        elements.addInput.value = query;
      }
      void loadFavoritePreview(query, elements, state);
    },
    onSuggestionsError: (error) => {
      if (!isFavoritesViewActive(elements, "add")) {
        return;
      }

      console.error("Preferiti: suggerimenti non disponibili", error);
      hideFavoritesSuggestions();
      state.addView.candidate = null;
      state.addView.feedback = "Suggerimenti citta non disponibili in questo momento.";
      state.addView.pending = false;
      renderFavoritesAddView(elements, state);
    },
    onUnresolvedSubmit: () => {
      if (!isFavoritesViewActive(elements, "add")) {
        return;
      }

      hideFavoritesSuggestions();
      state.addView.candidate = null;
      state.addView.feedback = "Nessuna localita trovata per questa ricerca.";
      state.addView.pending = false;
      renderFavoritesAddView(elements, state);
    },
    signal: favoritesRuntime?.controller?.signal,
    suggestions: elements.addSuggestions,
  });
}

function renderFavorites(elements, state) {
  if (elements.primaryLocation) {
    elements.primaryLocation.innerHTML = renderFavoriteCard(state.primaryLocation, { primary: true });
  }

  if (elements.count) {
    elements.count.textContent = getFavoritesCountLabel(state.favorites.length);
  }

  if (elements.grid) {
    elements.grid.innerHTML = state.favorites.length
      ? state.favorites.map((favorite) => renderFavoriteCard(favorite)).join("")
      : renderFavoritesEmptyState();
  }

  if (elements.syncStatus) {
    elements.syncStatus.textContent = state.syncStatus;
  }

  if (elements.feedback) {
    elements.feedback.textContent = state.feedback;
  }
}

function renderFavoritesAddView(elements, state) {
  if (elements.addFeedback) {
    elements.addFeedback.textContent = state.addView.feedback;
  }

  if (elements.addPreview) {
    elements.addPreview.innerHTML = renderFavoritesAddPreview({
      candidate: state.addView.candidate,
      pending: state.addView.pending,
    });
  }
}

async function hydratePrimaryLocation(elements, state) {
  const requestId = state.overviewRequestId + 1;
  state.overviewRequestId = requestId;
  state.isHydratingOverview = true;
  state.syncStatus = getOverviewSyncMessage(state);
  renderFavorites(elements, state);

  const currentPrimary = normalizePrimaryLocation(state.primaryLocation);

  const [primaryResult, favoriteResults] = await Promise.all([
    hydratePrimarySnapshot(currentPrimary),
    Promise.all(state.favorites.map((favorite) => hydrateFavoriteSnapshot(favorite))),
  ]);

  if (!isFavoritesOverviewRequestActive(elements, state, requestId)) {
    return;
  }

  state.primaryLocation = primaryResult.location;
  state.favorites = favoriteResults.map((result) => result.favorite);
  state.isHydratingOverview = false;

  const didRefreshPrimary = primaryResult.refreshed;
  const didRefreshFavorites = favoriteResults.some((result) => result.refreshed);
  const failureCount = favoriteResults.filter((result) => !result.refreshed).length + (primaryResult.refreshed ? 0 : 1);
  state.syncStatus = failureCount > 0
    ? "Alcune localita mostrano ancora l'ultimo snapshot disponibile."
    : "";

  if (didRefreshPrimary || didRefreshFavorites) {
    saveFavoritesStore(state);
  }

  renderFavorites(elements, state);
}

async function loadFavoritePreview(query, elements, state) {
  const normalizedQuery = normalizeQuery(query);

  if (!normalizedQuery) {
    state.addView.candidate = null;
    state.addView.feedback = "Inserisci una localita valida.";
    state.addView.pending = false;
    renderFavoritesAddView(elements, state);
    return;
  }

  if (isDuplicateFavorite(state.favorites, query)) {
    state.addView.candidate = null;
    state.addView.feedback = "Questa localita e gia tra i preferiti.";
    state.addView.pending = false;
    renderFavoritesAddView(elements, state);
    return;
  }

  const requestId = state.addView.requestId + 1;
  state.addView.requestId = requestId;
  state.addView.candidate = null;
  state.addView.feedback = "";
  state.addView.pending = true;
  renderFavoritesAddView(elements, state);

  let nextCandidate = null;
  let nextFeedback = "";

  try {
    const data = await fetchWeather(query);
    nextCandidate = createFavoriteFromWeather(data, query, { name: query });
  } catch (error) {
    console.warn("Preferiti: anteprima localita non disponibile", error);
    nextCandidate = createFallbackFavorite(query);
    nextFeedback = "Meteo live non disponibile. Puoi comunque aggiungere la localita.";
  }

  if (!isFavoritesAddViewActive(elements, state, requestId)) {
    return;
  }

  if (isDuplicateFavorite(state.favorites, nextCandidate.query)) {
    state.addView.candidate = null;
    state.addView.feedback = "Questa localita e gia tra i preferiti.";
    state.addView.pending = false;
    renderFavoritesAddView(elements, state);
    return;
  }

  state.addView.candidate = nextCandidate;
  state.addView.feedback = nextFeedback;
  state.addView.pending = false;
  renderFavoritesAddView(elements, state);
}

async function confirmAddFavorite(elements, state) {
  if (state.addView.pending) {
    return;
  }

  const candidate = normalizeFavorite(state.addView.candidate);

  if (!candidate) {
    state.addView.feedback = "Cerca una localita prima di confermare l'aggiunta.";
    renderFavoritesAddView(elements, state);
    return;
  }

  if (isDuplicateFavorite(state.favorites, candidate.query)) {
    state.addView.feedback = "Questa localita e gia tra i preferiti.";
    renderFavoritesAddView(elements, state);
    return;
  }

  state.addView.pending = true;
  renderFavoritesAddView(elements, state);

  state.favorites = [...state.favorites, candidate];
  saveFavoritesStore(state);
  state.feedback = `${candidate.name} aggiunta ai preferiti.`;

  if (elements.addInput) {
    elements.addInput.value = "";
  }

  hideFavoritesSuggestions();
  resetFavoritesAddState(state);
  window.location.hash = "favorites";
}

function createFavoriteFromWeather(data, query, fallback = {}) {
  const today = data.forecast_days?.[0] || {};

  return {
    description: capitalizeText(data.description || fallback.description || "Meteo disponibile"),
    maxTemperature: today.max_temperature ?? fallback.maxTemperature ?? data.temperature ?? null,
    minTemperature: today.min_temperature ?? fallback.minTemperature ?? data.feels_like ?? null,
    name: formatLocation(data) || fallback.name || query,
    precipitationProbability: today.precipitation_probability ?? fallback.precipitationProbability ?? 0,
    query,
    temperature: data.temperature ?? fallback.temperature ?? null,
    windSpeed: data.wind_speed ?? fallback.windSpeed ?? null,
  };
}

function createFallbackFavorite(query) {
  return {
    description: "Meteo non disponibile",
    maxTemperature: null,
    minTemperature: null,
    name: query,
    precipitationProbability: 0,
    query,
    temperature: null,
    windSpeed: null,
  };
}

async function hydratePrimarySnapshot(primaryLocation) {
  const fallbackLocation = normalizePrimaryLocation(primaryLocation);

  try {
    const data = await fetchWeather(fallbackLocation.query);

    return {
      location: createFavoriteFromWeather(data, fallbackLocation.query, fallbackLocation),
      refreshed: true,
    };
  } catch (error) {
    console.warn("Preferiti: meteo localita principale non disponibile", error);

    return {
      location: fallbackLocation,
      refreshed: false,
    };
  }
}

async function hydrateFavoriteSnapshot(favorite) {
  const fallbackFavorite = normalizeFavorite(favorite) || createFallbackFavorite(favorite?.query || "");

  try {
    const data = await fetchWeather(fallbackFavorite.query);

    return {
      favorite: createFavoriteFromWeather(data, fallbackFavorite.query, fallbackFavorite),
      refreshed: true,
    };
  } catch (error) {
    console.warn(`Preferiti: meteo non disponibile per ${fallbackFavorite.query}`, error);

    return {
      favorite: fallbackFavorite,
      refreshed: false,
    };
  }
}

function loadFavoritesStore() {
  const defaultStore = createDefaultFavoritesStore();

  if (typeof localStorage === "undefined") {
    return defaultStore;
  }

  try {
    const parsedStore = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || "null");

    if (Array.isArray(parsedStore)) {
      return {
        ...defaultStore,
        favorites: parsedStore.map(normalizeFavorite).filter(Boolean),
      };
    }

    if (parsedStore && typeof parsedStore === "object") {
      return {
        favorites: Array.isArray(parsedStore.favorites)
          ? parsedStore.favorites.map(normalizeFavorite).filter(Boolean)
          : defaultStore.favorites,
        primaryLocation: normalizePrimaryLocation(parsedStore.primaryLocation),
      };
    }
  } catch (error) {
    console.warn("Preferiti: preferiti salvati non validi", error);
  }

  return defaultStore;
}

function normalizeFavorite(favorite) {
  if (typeof favorite === "string") {
    return createFallbackFavorite(favorite);
  }

  if (!favorite?.query || !favorite?.name) {
    return null;
  }

  return {
    description: favorite.description || "Meteo disponibile",
    maxTemperature: favorite.maxTemperature ?? null,
    minTemperature: favorite.minTemperature ?? null,
    name: favorite.name,
    precipitationProbability: favorite.precipitationProbability ?? 0,
    query: favorite.query,
    temperature: favorite.temperature ?? null,
    windSpeed: favorite.windSpeed ?? null,
  };
}

function normalizePrimaryLocation(primaryLocation) {
  if (!primaryLocation?.query) {
    return { ...PRIMARY_FALLBACK };
  }

  return {
    ...PRIMARY_FALLBACK,
    ...primaryLocation,
  };
}

function saveFavoritesStore({ favorites, primaryLocation }) {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify({
      favorites: Array.isArray(favorites) ? favorites.map(normalizeFavorite).filter(Boolean) : [],
      primaryLocation: normalizePrimaryLocation(primaryLocation),
    }));
  } catch (error) {
    console.warn("Preferiti: impossibile salvare i preferiti", error);
  }
}

function normalizeQuery(value) {
  return String(value || "").trim().toLowerCase();
}

function getFavoritesCountLabel(count) {
  return count === 1 ? "1 preferita" : `${count} preferite`;
}

function hideFavoritesSuggestions() {
  favoritesRuntime?.searchController?.hideSuggestions?.();
}

function isDuplicateFavorite(favorites, query) {
  return favorites.some((favorite) => normalizeQuery(favorite.query) === normalizeQuery(query));
}

function isFavoritesViewActive(elements, view) {
  return Boolean(
    favoritesRuntime
    && favoritesRuntime.elements === elements
    && favoritesRuntime.view === view,
  );
}

function isFavoritesOverviewRequestActive(elements, state, requestId) {
  return Boolean(
    isFavoritesViewActive(elements, FAVORITES_DEFAULT_VIEW)
    && state.overviewRequestId === requestId,
  );
}

function isFavoritesAddViewActive(elements, state, requestId) {
  return Boolean(
    isFavoritesViewActive(elements, "add")
    && state.addView.requestId === requestId,
  );
}

function resetFavoritesAddState(state) {
  state.addView = {
    ...createInitialFavoritesAddState(),
    requestId: (state.addView?.requestId || 0) + 1,
  };
}

function resolveFavoritesView(routeState) {
  const routeSegments = Array.isArray(routeState?.pathSegments) ? routeState.pathSegments : [];
  const routeView = routeSegments[0] || FAVORITES_DEFAULT_VIEW;

  if (routeView === FAVORITES_DEFAULT_VIEW || routeView === "add") {
    return routeView;
  }

  return null;
}

function getOverviewSyncMessage(state) {
  return state.favorites.length
    ? "Aggiornamento meteo dei preferiti in corso..."
    : "Aggiornamento localita principale in corso...";
}
