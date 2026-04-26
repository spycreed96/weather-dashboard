import { bindAppShell, renderAppHeader, renderAppSidebar } from "../../shared/components/app-shell.js";
import { createCitySearchController } from "../../shared/services/city-search-controller.js";
import {
  addFavoriteToStore,
  createFallbackFavorite,
  getFavoritesStoreSnapshot,
  isPrimaryLocationQuery,
  normalizeFavorite,
  normalizePrimaryLocation,
  removeFavoriteFromStore,
  replaceFavoritesStore,
} from "../../shared/services/favorites-store.js";
import { fetchCitySuggestions, fetchWeather } from "../weather/services/weather-api.js";
import { capitalizeText, formatLocation } from "../weather/utils/weather-formatters.js";
import {
  renderFavoriteCard,
  renderFavoritesAddPage,
  renderFavoritesAddPreview,
  renderFavoritesEmptyState,
  renderFavoritesPage,
} from "./components/favorites-page.js";

const FAVORITES_DEFAULT_VIEW = "overview";

function createInitialFavoritesAddState() {
  return {
    candidate: null,
    feedback: "",
    pending: false,
    requestId: 0,
  };
}

const initialFavoritesStore = getFavoritesStoreSnapshot();

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

  applyFavoritesStoreSnapshot(favoritesState, getFavoritesStoreSnapshot());

  const controller = new AbortController();
  favoritesRuntime = {
    activeContextCard: null,
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
    contextMenu: root.querySelector("#favorites-context-menu"),
    contextMenuRemoveButton: root.querySelector("#favorites-remove-button"),
    feedback: root.querySelector("#favorites-feedback"),
    grid: root.querySelector("#favorites-grid"),
    primaryLocation: root.querySelector("#favorites-primary-location"),
    syncStatus: root.querySelector("#favorites-sync-status"),
  };
}

function bindFavoritesInteractions(root, elements, state, signal, view) {
  root.addEventListener("click", (event) => {
    if (view === FAVORITES_DEFAULT_VIEW && !event.target.closest("#favorites-context-menu")) {
      closeFavoritesContextMenu(elements);
    }

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

    if (view === FAVORITES_DEFAULT_VIEW && event.target.closest("#favorites-remove-button")) {
      removeFavoriteFromContextMenu(elements, state);
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

  if (view === FAVORITES_DEFAULT_VIEW) {
    root.addEventListener("contextmenu", (event) => {
      const favoriteCard = event.target.closest("[data-favorite-query]");
      if (!favoriteCard || !elements.grid?.contains(favoriteCard)) {
        closeFavoritesContextMenu(elements);
        return;
      }

      event.preventDefault();
      openFavoritesContextMenu(favoriteCard, elements, {
        clientX: event.clientX,
        clientY: event.clientY,
      });
    }, { signal });

    document.addEventListener("click", (event) => {
      if (!event.target.closest("#favorites-context-menu")) {
        closeFavoritesContextMenu(elements);
      }
    }, { signal });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeFavoritesContextMenu(elements);
      }
    }, { signal });

    window.addEventListener("resize", () => {
      closeFavoritesContextMenu(elements);
    }, { signal });

    document.addEventListener("scroll", () => {
      closeFavoritesContextMenu(elements);
    }, { capture: true, signal });
  }

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
      state.addView.feedback = "Nessuna località trovata per questa ricerca.";
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
      ? state.favorites.map((favorite) => renderFavoriteCard(favorite, { contextMenu: true })).join("")
      : renderFavoritesEmptyState();
  }

  if (elements.syncStatus) {
    elements.syncStatus.textContent = state.syncStatus;
  }

  if (elements.feedback) {
    elements.feedback.textContent = state.feedback;
  }

  closeFavoritesContextMenu(elements);
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

  const nextStoreSnapshot = {
    favorites: favoriteResults.map((result) => result.favorite),
    primaryLocation: primaryResult.location,
  };

  applyFavoritesStoreSnapshot(state, nextStoreSnapshot);
  state.isHydratingOverview = false;

  const didRefreshPrimary = primaryResult.refreshed;
  const didRefreshFavorites = favoriteResults.some((result) => result.refreshed);
  const failureCount = favoriteResults.filter((result) => !result.refreshed).length + (primaryResult.refreshed ? 0 : 1);
  state.syncStatus = failureCount > 0
    ? "Alcune località mostrano ancora l'ultimo snapshot disponibile."
    : "";

  if (didRefreshPrimary || didRefreshFavorites) {
    applyFavoritesStoreSnapshot(state, replaceFavoritesStore(nextStoreSnapshot));
  }

  renderFavorites(elements, state);
}

async function loadFavoritePreview(query, elements, state) {
  const normalizedQuery = normalizeQuery(query);

  if (!normalizedQuery) {
    state.addView.candidate = null;
    state.addView.feedback = "Inserisci una località valida.";
    state.addView.pending = false;
    renderFavoritesAddView(elements, state);
    return;
  }

  const duplicateMessage = getDuplicateLocationMessage(state, query);
  if (duplicateMessage) {
    state.addView.candidate = null;
    state.addView.feedback = duplicateMessage;
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
    console.warn("Preferiti: anteprima località non disponibile", error);
    nextCandidate = createFallbackFavorite(query);
    nextFeedback = "Meteo live non disponibile. Puoi comunque aggiungere la località.";
  }

  if (!isFavoritesAddViewActive(elements, state, requestId)) {
    return;
  }

  const candidateDuplicateMessage = getDuplicateLocationMessage(state, nextCandidate.query);
  if (candidateDuplicateMessage) {
    state.addView.candidate = null;
    state.addView.feedback = candidateDuplicateMessage;
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
    state.addView.feedback = "Cerca una località prima di confermare l'aggiunta.";
    renderFavoritesAddView(elements, state);
    return;
  }

  const duplicateMessage = getDuplicateLocationMessage(state, candidate.query);
  if (duplicateMessage) {
    state.addView.feedback = duplicateMessage;
    renderFavoritesAddView(elements, state);
    return;
  }

  state.addView.pending = true;
  renderFavoritesAddView(elements, state);

  applyFavoritesStoreSnapshot(state, addFavoriteToStore(candidate));
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
    icon: data.icon ?? fallback.icon ?? null,
    maxTemperature: today.max_temperature ?? fallback.maxTemperature ?? data.temperature ?? null,
    minTemperature: today.min_temperature ?? fallback.minTemperature ?? data.feels_like ?? null,
    name: formatLocation(data) || fallback.name || query,
    precipitationProbability: today.precipitation_probability ?? fallback.precipitationProbability ?? 0,
    query,
    temperature: data.temperature ?? fallback.temperature ?? null,
    windSpeed: data.wind_speed ?? fallback.windSpeed ?? null,
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
    console.warn("Preferiti: meteo località principale non disponibile", error);

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

function normalizeQuery(value) {
  return String(value || "").trim().toLowerCase();
}

function getFavoritesCountLabel(count) {
  return count === 1 ? "1 preferita" : `${count} preferite`;
}

function hideFavoritesSuggestions() {
  favoritesRuntime?.searchController?.hideSuggestions?.();
}

function openFavoritesContextMenu(card, elements, position = null) {
  if (!card || !elements.contextMenu || !elements.contextMenuRemoveButton) {
    return;
  }

  favoritesRuntime.activeContextCard = card;
  elements.contextMenu.dataset.favoriteQuery = String(card.dataset.favoriteQuery || "").trim();
  elements.contextMenu.dataset.favoriteName = String(card.dataset.favoriteName || "").trim();
  elements.contextMenu.classList.add("show");
  elements.contextMenu.setAttribute("aria-hidden", "false");
  positionFavoritesContextMenu(card, elements.contextMenu, position);
}

function closeFavoritesContextMenu(elements) {
  if (favoritesRuntime) {
    favoritesRuntime.activeContextCard = null;
  }

  if (!elements.contextMenu) {
    return;
  }

  elements.contextMenu.classList.remove("show");
  elements.contextMenu.setAttribute("aria-hidden", "true");
  elements.contextMenu.style.removeProperty("left");
  elements.contextMenu.style.removeProperty("top");
  delete elements.contextMenu.dataset.favoriteQuery;
  delete elements.contextMenu.dataset.favoriteName;
}

function positionFavoritesContextMenu(card, contextMenu, position = null) {
  if (!card || !contextMenu) {
    return;
  }

  contextMenu.style.left = "0px";
  contextMenu.style.top = "0px";
  contextMenu.style.visibility = "hidden";

  const menuRect = contextMenu.getBoundingClientRect();
  const spacing = 10;
  const fallbackRect = card.getBoundingClientRect();
  let left = Number.isFinite(position?.clientX) ? position.clientX : fallbackRect.left + 10;
  let top = Number.isFinite(position?.clientY) ? position.clientY : fallbackRect.bottom + spacing;

  left += spacing;
  top += spacing;

  if (left + menuRect.width > window.innerWidth - 12) {
    left = window.innerWidth - menuRect.width - 12;
  }

  if (top + menuRect.height > window.innerHeight - 12) {
    const fallbackTop = Number.isFinite(position?.clientY)
      ? position.clientY - menuRect.height - spacing
      : fallbackRect.top - menuRect.height - spacing;
    top = Math.max(12, fallbackTop);
  }

  left = Math.max(12, left);
  top = Math.max(12, top);

  contextMenu.style.left = `${left}px`;
  contextMenu.style.top = `${top}px`;
  contextMenu.style.visibility = "";
}

function removeFavoriteFromContextMenu(elements, state) {
  const favoriteQuery = String(elements.contextMenu?.dataset.favoriteQuery || "").trim();
  const favoriteName = String(elements.contextMenu?.dataset.favoriteName || "").trim();

  if (!favoriteQuery) {
    closeFavoritesContextMenu(elements);
    return;
  }

  applyFavoritesStoreSnapshot(state, removeFavoriteFromStore(favoriteQuery));
  state.feedback = `${favoriteName || "La località selezionata"} rimossa dai preferiti.`;
  renderFavorites(elements, state);
}

function isDuplicateFavorite(favorites, query) {
  return favorites.some((favorite) => normalizeQuery(favorite.query) === normalizeQuery(query));
}

function getDuplicateLocationMessage(state, query) {
  if (isPrimaryLocationQuery(query) || normalizeQuery(state.primaryLocation?.query) === normalizeQuery(query)) {
    return "Questa località e gia impostata come principale.";
  }

  if (isDuplicateFavorite(state.favorites, query)) {
    return "Questa località e gia tra i preferiti.";
  }

  return "";
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

function applyFavoritesStoreSnapshot(state, snapshot) {
  state.favorites = Array.isArray(snapshot?.favorites) ? snapshot.favorites.map((favorite) => ({ ...favorite })) : [];
  state.primaryLocation = normalizePrimaryLocation(snapshot?.primaryLocation);
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
    : "Aggiornamento località principale in corso...";
}
