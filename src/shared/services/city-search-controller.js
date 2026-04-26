const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_LIMIT = 5;
const DEFAULT_MIN_LENGTH = 3;
const DEFAULT_CACHE_LIMIT = 50;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function getCitySearchCacheKey(query) {
  return String(query || "").trim().toLowerCase();
}

export function normalizeCitySearchValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function filterCitySuggestions(query, suggestions, { minLength = DEFAULT_MIN_LENGTH } = {}) {
  const normalizedQuery = normalizeCitySearchValue(query);
  if (normalizedQuery.length < minLength) {
    return [];
  }

  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const firstQueryToken = queryTokens[0] || normalizedQuery;
  const collapsedQuery = normalizedQuery.replaceAll(" ", "");

  return suggestions.filter((suggestion) => {
    const city = normalizeCitySearchValue(suggestion.name);
    const regionCountry = normalizeCitySearchValue(suggestion.region_country);
    const fullName = normalizeCitySearchValue(suggestion.full_name);
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

function setCacheEntry(cache, cacheKey, suggestions, cacheLimit) {
  if (!cacheKey) {
    return;
  }

  if (cache.has(cacheKey)) {
    cache.delete(cacheKey);
  }

  cache.set(cacheKey, suggestions);

  if (cache.size <= cacheLimit) {
    return;
  }

  const oldestKey = cache.keys().next().value;
  if (oldestKey) {
    cache.delete(oldestKey);
  }
}

function renderSuggestionsMarkup(suggestions) {
  return suggestions.map((item) => {
    const city = escapeHtml(item.name || "");
    const query = escapeHtml(item.full_name || item.name || "");
    const regionCountry = escapeHtml(item.region_country || "");

    return `
      <div class="suggestion-item" data-city="${city}" data-query="${query}" data-region-country="${regionCountry}">
        <div class="suggestion-city">${city}</div>
        <div class="suggestion-region">${regionCountry}</div>
      </div>
    `;
  }).join("");
}

function createNoopController() {
  return {
    cancelPendingLookup() {},
    destroy() {},
    hideSuggestions() {},
    resolveQuery(query) {
      return Promise.resolve(query);
    },
  };
}

export function createCitySearchController(options = {}) {
  const {
    fetchSuggestions,
    form,
    input,
    isStale = () => false,
    limit = DEFAULT_LIMIT,
    minLength = DEFAULT_MIN_LENGTH,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    cacheLimit = DEFAULT_CACHE_LIMIT,
    onResolvedSubmit,
    onSelectSuggestion,
    onSuggestionsError,
    onUnresolvedSubmit,
    signal,
    suggestions,
  } = options;

  if (!form || !input || !suggestions || typeof fetchSuggestions !== "function") {
    return createNoopController();
  }

  const state = {
    abortController: null,
    cache: new Map(),
    debounceTimer: null,
    destroyed: false,
    requestId: 0,
  };

  function isActive(requestId = null) {
    if (state.destroyed || isStale()) {
      return false;
    }

    if (requestId !== null && requestId !== state.requestId) {
      return false;
    }

    return true;
  }

  function clearDebounce() {
    if (!state.debounceTimer) {
      return;
    }

    clearTimeout(state.debounceTimer);
    state.debounceTimer = null;
  }

  function abortRequest() {
    state.abortController?.abort();
    state.abortController = null;
  }

  function hideSuggestions() {
    suggestions.innerHTML = "";
    suggestions.style.display = "none";
  }

  function renderSuggestions(suggestionItems) {
    if (!suggestionItems.length) {
      hideSuggestions();
      return;
    }

    suggestions.innerHTML = renderSuggestionsMarkup(suggestionItems);
    suggestions.style.display = "block";
  }

  async function getSuggestionsForQuery(query, { requestId = null, useAbortController = false } = {}) {
    const cacheKey = getCitySearchCacheKey(query);
    if (!cacheKey || cacheKey.length < minLength) {
      return [];
    }

    const cachedSuggestions = state.cache.get(cacheKey);
    if (cachedSuggestions) {
      return filterCitySuggestions(query, cachedSuggestions, { minLength });
    }

    if (useAbortController) {
      abortRequest();
      state.abortController = new AbortController();
    }

    try {
      const responseSuggestions = await fetchSuggestions(query, {
        limit,
        signal: state.abortController?.signal,
      });

      if (!isActive(requestId)) {
        return [];
      }

      const filteredSuggestions = filterCitySuggestions(query, responseSuggestions, { minLength });
      setCacheEntry(state.cache, cacheKey, filteredSuggestions, cacheLimit);
      return filteredSuggestions;
    } finally {
      if (useAbortController) {
        state.abortController = null;
      }
    }
  }

  function cancelPendingLookup() {
    state.requestId += 1;
    clearDebounce();
    abortRequest();
  }

  async function resolveQuery(query) {
    const normalizedQuery = getCitySearchCacheKey(query);
    if (normalizedQuery.length < minLength) {
      return query;
    }

    try {
      const suggestionItems = await getSuggestionsForQuery(query, { useAbortController: true });
      if (!isActive()) {
        return null;
      }

      if (!suggestionItems.length) {
        return null;
      }

      const exactSuggestion = suggestionItems.find((item) => {
        return getCitySearchCacheKey(item.name) === normalizedQuery
          || getCitySearchCacheKey(item.full_name) === normalizedQuery;
      });

      const resolvedSuggestion = exactSuggestion || suggestionItems[0];
      return resolvedSuggestion.full_name || resolvedSuggestion.name || query;
    } catch (error) {
      if (error?.name === "AbortError") {
        return null;
      }

      onSuggestionsError?.(error, query);
      return null;
    }
  }

  function destroy() {
    if (state.destroyed) {
      return;
    }

    state.destroyed = true;
    clearDebounce();
    abortRequest();
    hideSuggestions();
  }

  input.addEventListener("input", (event) => {
    const query = event.target.value.trim();
    const requestId = state.requestId + 1;
    state.requestId = requestId;
    clearDebounce();
    abortRequest();

    if (query.length < minLength) {
      hideSuggestions();
      return;
    }

    state.debounceTimer = window.setTimeout(async () => {
      if (!isActive(requestId)) {
        return;
      }

      try {
        const suggestionItems = await getSuggestionsForQuery(query, {
          requestId,
          useAbortController: true,
        });

        if (!isActive(requestId)) {
          return;
        }

        renderSuggestions(suggestionItems);
      } catch (error) {
        if (error?.name === "AbortError" || !isActive(requestId)) {
          return;
        }

        onSuggestionsError?.(error, query);
        hideSuggestions();
      }
    }, debounceMs);
  }, { signal });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) {
      return;
    }

    cancelPendingLookup();

    const resolvedQuery = await resolveQuery(query);
    if (!isActive()) {
      return;
    }

    if (!resolvedQuery) {
      onUnresolvedSubmit?.({ query });
      return;
    }

    onResolvedSubmit?.({
      query,
      resolvedQuery,
    });
  }, { signal });

  suggestions.addEventListener("click", (event) => {
    const item = event.target.closest(".suggestion-item");
    if (!item) {
      return;
    }

    cancelPendingLookup();
    hideSuggestions();

    onSelectSuggestion?.({
      city: item.dataset.city || "",
      query: item.dataset.query || item.dataset.city || "",
      regionCountry: item.dataset.regionCountry || "",
    });
  }, { signal });

  signal?.addEventListener("abort", destroy, { once: true });

  return {
    cancelPendingLookup,
    destroy,
    hideSuggestions,
    resolveQuery,
  };
}
