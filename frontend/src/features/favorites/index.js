import { bindAppShell, renderAppHeader } from "../../shared/components/app-shell.js";
import { fetchWeather } from "../weather/services/weather-api.js";
import { capitalizeText, formatLocation } from "../weather/utils/weather-formatters.js";
import { renderAddFavoriteTile, renderFavoriteCard, renderFavoritesPage } from "./components/favorites-page.js";

const FAVORITES_STORAGE_KEY = "weather-dashboard-favorite-locations";

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

const favoritesState = {
  addQuery: "",
  favorites: loadFavorites(),
  feedback: "",
  isAdding: false,
  pending: false,
  primaryLocation: { ...PRIMARY_FALLBACK },
};

let favoritesRuntime = null;

export function mountFavorites(root) {
  unmountFavorites();

  const controller = new AbortController();
  favoritesRuntime = {
    controller,
    root,
    shellBinding: null,
  };

  root.innerHTML = `
    ${renderAppHeader({ title: "Preferiti", activePage: "favorites" })}
    ${renderFavoritesPage()}
  `;

  const elements = getElements(root);
  favoritesRuntime.shellBinding = bindAppShell(root);
  bindFavoritesInteractions(root, elements, favoritesState, controller.signal);
  renderFavorites(elements, favoritesState);
  void hydratePrimaryLocation(elements, favoritesState);
}

export function unmountFavorites() {
  if (!favoritesRuntime) {
    return;
  }

  favoritesRuntime.controller.abort();
  favoritesRuntime.shellBinding?.destroy?.();
  favoritesState.pending = false;
  favoritesState.isAdding = false;
  favoritesState.feedback = "";
  favoritesRuntime.root.replaceChildren();
  favoritesRuntime = null;
}

function getElements(root) {
  return {
    feedback: root.querySelector("#favorites-feedback"),
    grid: root.querySelector("#favorites-grid"),
    primaryLocation: root.querySelector("#favorites-primary-location"),
  };
}

function bindFavoritesInteractions(root, elements, state, signal) {
  root.addEventListener("click", (event) => {
    if (event.target.closest("#favorites-add-open")) {
      state.isAdding = true;
      state.feedback = "";
      renderFavorites(elements, state);
      root.querySelector("#favorites-add-input")?.focus();
      return;
    }

    if (event.target.closest("#favorites-add-cancel")) {
      state.isAdding = false;
      state.addQuery = "";
      state.feedback = "";
      renderFavorites(elements, state);
    }
  }, { signal });

  root.addEventListener("input", (event) => {
    if (event.target.id === "favorites-add-input") {
      state.addQuery = event.target.value;
    }
  }, { signal });

  root.addEventListener("submit", async (event) => {
    if (event.target.id !== "favorites-add-form") {
      return;
    }

    event.preventDefault();
    await addFavoriteLocation(elements, state);
  }, { signal });
}

function renderFavorites(elements, state) {
  if (elements.primaryLocation) {
    elements.primaryLocation.innerHTML = renderFavoriteCard(state.primaryLocation, { primary: true });
  }

  if (elements.grid) {
    const cards = state.favorites.map((favorite) => renderFavoriteCard(favorite)).join("");
    elements.grid.innerHTML = `${cards}${renderAddFavoriteTile({
      isAdding: state.isAdding,
      pending: state.pending,
      query: state.addQuery,
    })}`;
  }

  if (elements.feedback) {
    elements.feedback.textContent = state.feedback;
  }
}

async function hydratePrimaryLocation(elements, state) {
  try {
    const data = await fetchWeather(PRIMARY_FALLBACK.query);

    if (!favoritesRuntime) {
      return;
    }

    state.primaryLocation = createFavoriteFromWeather(data, PRIMARY_FALLBACK.query, PRIMARY_FALLBACK);
    renderFavorites(elements, state);
  } catch (error) {
    console.warn("Preferiti: meteo localita principale non disponibile", error);
  }
}

async function addFavoriteLocation(elements, state) {
  const query = state.addQuery.trim();

  if (!query) {
    state.feedback = "Inserisci una localita valida.";
    renderFavorites(elements, state);
    return;
  }

  if (state.favorites.some((favorite) => normalizeQuery(favorite.query) === normalizeQuery(query))) {
    state.feedback = "Questa localita e gia tra i preferiti.";
    renderFavorites(elements, state);
    return;
  }

  state.pending = true;
  state.feedback = "";
  renderFavorites(elements, state);

  let nextFavorite;

  try {
    const data = await fetchWeather(query);
    nextFavorite = createFavoriteFromWeather(data, query, { name: query });
  } catch (error) {
    console.warn("Preferiti: aggiungo la localita senza dati meteo live", error);
    nextFavorite = createFallbackFavorite(query);
  } finally {
    if (!favoritesRuntime) {
      return;
    }

    state.favorites = [...state.favorites, nextFavorite];
    state.addQuery = "";
    state.feedback = "";
    state.isAdding = false;
    state.pending = false;
    saveFavorites(state.favorites);
    renderFavorites(elements, state);
  }
}

function createFavoriteFromWeather(data, query, fallback = {}) {
  const today = data.forecast_days?.[0] || {};

  return {
    description: capitalizeText(data.description || fallback.description || "Meteo disponibile"),
    maxTemperature: today.max_temperature ?? fallback.maxTemperature ?? data.temperature,
    minTemperature: fallback.minTemperature ?? today.current_temperature ?? data.feels_like,
    name: formatLocation(data) || fallback.name || query,
    precipitationProbability: today.precipitation_probability ?? fallback.precipitationProbability ?? 0,
    query,
    temperature: data.temperature ?? fallback.temperature,
    windSpeed: data.wind_speed ?? fallback.windSpeed,
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

function loadFavorites() {
  try {
    const parsedFavorites = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || "null");

    if (Array.isArray(parsedFavorites) && parsedFavorites.length) {
      return parsedFavorites.map(normalizeFavorite).filter(Boolean);
    }
  } catch (error) {
    console.warn("Preferiti: preferiti salvati non validi", error);
  }

  return DEFAULT_FAVORITES.map((favorite) => ({ ...favorite }));
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

function saveFavorites(favorites) {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  } catch (error) {
    console.warn("Preferiti: impossibile salvare i preferiti", error);
  }
}

function normalizeQuery(value) {
  return String(value || "").trim().toLowerCase();
}
