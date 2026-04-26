import { getJson } from "../../../shared/services/http.js";

const API_ROOT = "/api";

export function fetchWeather(city = "Catanzaro") {
  const query = encodeURIComponent(city);
  return getJson(`${API_ROOT}/weather?city=${query}`);
}

export function fetchCitySuggestions(query, { limit = 5, signal } = {}) {
  const encodedQuery = encodeURIComponent(query);
  return getJson(`${API_ROOT}/cities?q=${encodedQuery}&limit=${limit}`, { signal });
}
