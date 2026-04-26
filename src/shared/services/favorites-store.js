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

let favoritesStore = loadFavoritesStore();

export function createFallbackFavorite(query) {
  const normalizedQuery = normalizeText(query);

  return {
    description: "Meteo non disponibile",
    icon: null,
    maxTemperature: null,
    minTemperature: null,
    name: normalizedQuery || PRIMARY_FALLBACK.name,
    precipitationProbability: 0,
    query: normalizedQuery || PRIMARY_FALLBACK.query,
    temperature: null,
    windSpeed: null,
  };
}

export function createDefaultFavoritesStore() {
  return {
    favorites: DEFAULT_FAVORITES.map((favorite) => ({ ...favorite })),
    primaryLocation: { ...PRIMARY_FALLBACK },
  };
}

export function normalizeFavorite(favorite) {
  if (typeof favorite === "string") {
    return createFallbackFavorite(favorite);
  }

  const normalizedQuery = normalizeText(favorite?.query);
  const normalizedName = normalizeText(favorite?.name);

  if (!normalizedQuery || !normalizedName) {
    return null;
  }

  return {
    description: normalizeText(favorite.description) || "Meteo disponibile",
    icon: favorite.icon ?? null,
    maxTemperature: favorite.maxTemperature ?? null,
    minTemperature: favorite.minTemperature ?? null,
    name: normalizedName,
    precipitationProbability: favorite.precipitationProbability ?? 0,
    query: normalizedQuery,
    temperature: favorite.temperature ?? null,
    windSpeed: favorite.windSpeed ?? null,
  };
}

export function normalizePrimaryLocation(primaryLocation) {
  const normalizedQuery = normalizeText(primaryLocation?.query);
  if (!normalizedQuery) {
    return { ...PRIMARY_FALLBACK };
  }

  return {
    ...PRIMARY_FALLBACK,
    ...primaryLocation,
    description: normalizeText(primaryLocation?.description) || PRIMARY_FALLBACK.description,
    name: normalizeText(primaryLocation?.name) || normalizedQuery || PRIMARY_FALLBACK.name,
    query: normalizedQuery,
  };
}

export function getFavoritesStoreSnapshot() {
  return cloneFavoritesStore(favoritesStore);
}

export function getPrimaryLocationQuery() {
  return normalizePrimaryLocation(favoritesStore.primaryLocation).query;
}

export function isPrimaryLocationQuery(query) {
  return normalizeQuery(getPrimaryLocationQuery()) === normalizeQuery(query);
}

export function isFavoriteLocationQuery(query) {
  return favoritesStore.favorites.some((favorite) => normalizeQuery(favorite.query) === normalizeQuery(query));
}

export function isSavedLocationQuery(query) {
  return isPrimaryLocationQuery(query) || isFavoriteLocationQuery(query);
}

export function getHistoryLocationsSnapshot() {
  const snapshot = getFavoritesStoreSnapshot();
  const primaryLocation = normalizePrimaryLocation(snapshot.primaryLocation);
  const primaryQuery = normalizeQuery(primaryLocation.query);

  return [
    primaryLocation,
    ...snapshot.favorites.filter((favorite) => normalizeQuery(favorite.query) !== primaryQuery),
  ];
}

export function replaceFavoritesStore(nextStore) {
  favoritesStore = normalizeFavoritesStore(nextStore);
  persistFavoritesStore(favoritesStore);
  return getFavoritesStoreSnapshot();
}

export function addFavoriteToStore(favorite) {
  const normalizedFavorite = normalizeFavorite(favorite);
  if (!normalizedFavorite || isSavedLocationQuery(normalizedFavorite.query)) {
    return getFavoritesStoreSnapshot();
  }

  return replaceFavoritesStore({
    ...favoritesStore,
    favorites: [...favoritesStore.favorites, normalizedFavorite],
  });
}

export function removeFavoriteFromStore(query) {
  return replaceFavoritesStore({
    ...favoritesStore,
    favorites: favoritesStore.favorites.filter((favorite) => normalizeQuery(favorite.query) !== normalizeQuery(query)),
  });
}

export function removeLocationFromStore(query) {
  const normalizedTargetQuery = normalizeQuery(query);
  if (!normalizedTargetQuery) {
    return getFavoritesStoreSnapshot();
  }

  const currentPrimary = normalizePrimaryLocation(favoritesStore.primaryLocation);
  const isPrimaryTarget = normalizeQuery(currentPrimary.query) === normalizedTargetQuery;

  if (!isPrimaryTarget) {
    return removeFavoriteFromStore(query);
  }

  if (!favoritesStore.favorites.length) {
    return getFavoritesStoreSnapshot();
  }

  const [nextPrimary, ...remainingFavorites] = favoritesStore.favorites;
  return replaceFavoritesStore({
    primaryLocation: nextPrimary,
    favorites: remainingFavorites,
  });
}

export function updateSavedLocationSnapshot(location) {
  const normalizedLocation = normalizeFavorite(location);
  if (!normalizedLocation?.query) {
    return getFavoritesStoreSnapshot();
  }

  const normalizedLocationQuery = normalizeQuery(normalizedLocation.query);
  const currentPrimary = normalizePrimaryLocation(favoritesStore.primaryLocation);

  if (normalizeQuery(currentPrimary.query) === normalizedLocationQuery) {
    return replaceFavoritesStore({
      ...favoritesStore,
      primaryLocation: normalizePrimaryLocation({
        ...currentPrimary,
        ...normalizedLocation,
      }),
    });
  }

  let didUpdateFavorite = false;
  const nextFavorites = favoritesStore.favorites.map((favorite) => {
    if (normalizeQuery(favorite.query) !== normalizedLocationQuery) {
      return favorite;
    }

    didUpdateFavorite = true;
    return {
      ...favorite,
      ...normalizedLocation,
    };
  });

  if (!didUpdateFavorite) {
    return getFavoritesStoreSnapshot();
  }

  return replaceFavoritesStore({
    ...favoritesStore,
    favorites: nextFavorites,
  });
}

export function promoteFavoriteToPrimary(favorite) {
  const nextPrimaryCandidate = normalizeFavorite(favorite);
  if (!nextPrimaryCandidate) {
    return getFavoritesStoreSnapshot();
  }

  const nextPrimaryQuery = normalizeQuery(nextPrimaryCandidate.query);
  const currentPrimary = normalizePrimaryLocation(favoritesStore.primaryLocation);

  if (normalizeQuery(currentPrimary.query) === nextPrimaryQuery) {
    return getFavoritesStoreSnapshot();
  }

  const targetFavorite = favoritesStore.favorites.find((item) => normalizeQuery(item.query) === nextPrimaryQuery);
  if (!targetFavorite) {
    return getFavoritesStoreSnapshot();
  }

  const nextPrimary = normalizePrimaryLocation({
    ...targetFavorite,
    ...nextPrimaryCandidate,
  });

  return replaceFavoritesStore({
    primaryLocation: nextPrimary,
    favorites: [
      currentPrimary,
      ...favoritesStore.favorites.filter((item) => normalizeQuery(item.query) !== nextPrimaryQuery),
    ],
  });
}

function cloneFavoritesStore(store) {
  const normalizedStore = normalizeFavoritesStore(store);

  return {
    favorites: normalizedStore.favorites.map((favorite) => ({ ...favorite })),
    primaryLocation: { ...normalizedStore.primaryLocation },
  };
}

function normalizeFavoritesStore(store) {
  const defaultStore = createDefaultFavoritesStore();

  if (!store || typeof store !== "object") {
    return defaultStore;
  }

  const primaryLocation = normalizePrimaryLocation(store.primaryLocation);
  const primaryQuery = normalizeQuery(primaryLocation.query);
  const normalizedFavorites = Array.isArray(store.favorites)
    ? dedupeFavorites(store.favorites).filter((favorite) => normalizeQuery(favorite.query) !== primaryQuery)
    : defaultStore.favorites.filter((favorite) => normalizeQuery(favorite.query) !== primaryQuery);

  return {
    favorites: normalizedFavorites,
    primaryLocation,
  };
}

function dedupeFavorites(favorites) {
  const seenQueries = new Set();

  return favorites
    .map((favorite) => normalizeFavorite(favorite))
    .filter((favorite) => {
      if (!favorite) {
        return false;
      }

      const favoriteQuery = normalizeQuery(favorite.query);
      if (!favoriteQuery || seenQueries.has(favoriteQuery)) {
        return false;
      }

      seenQueries.add(favoriteQuery);
      return true;
    });
}

function loadFavoritesStore() {
  const defaultStore = createDefaultFavoritesStore();

  if (typeof localStorage === "undefined") {
    return defaultStore;
  }

  try {
    const parsedStore = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || "null");

    if (Array.isArray(parsedStore)) {
      const normalizedStore = {
        ...defaultStore,
        favorites: dedupeFavorites(parsedStore).filter(
          (favorite) => normalizeQuery(favorite.query) !== normalizeQuery(defaultStore.primaryLocation.query),
        ),
      };
      persistFavoritesStore(normalizedStore);
      return normalizedStore;
    }

    if (parsedStore && typeof parsedStore === "object") {
      const normalizedStore = normalizeFavoritesStore(parsedStore);
      persistFavoritesStore(normalizedStore);
      return normalizedStore;
    }

    return defaultStore;
  } catch (error) {
    console.warn("Preferiti: preferiti salvati non validi", error);
    return defaultStore;
  }
}

function persistFavoritesStore(store) {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify({
      favorites: store.favorites.map((favorite) => normalizeFavorite(favorite)).filter(Boolean),
      primaryLocation: normalizePrimaryLocation(store.primaryLocation),
    }));
  } catch (error) {
    console.warn("Preferiti: impossibile salvare i preferiti", error);
  }
}

function normalizeQuery(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || "").trim();
}
