import { buildApiUrl } from "../../../shared/config.js";
import { getJson } from "../../../shared/services/http.js";

export function fetchWeather(city = "Catanzaro") {
  const query = encodeURIComponent(city);
  return getJson(buildApiUrl(`/weather?city=${query}`));
}

export function fetchCitySuggestions(query, { limit = 5, signal } = {}) {
  const encodedQuery = encodeURIComponent(query);
  return getJson(buildApiUrl(`/cities?q=${encodedQuery}&limit=${limit}`), { signal });
}
