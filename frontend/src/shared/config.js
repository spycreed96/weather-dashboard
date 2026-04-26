const DEFAULT_API_BASE_URL = "/api";
const runtimeConfig = window.__WEATHER_DASHBOARD_CONFIG__ ?? {};

function normalizeApiBaseUrl(value) {
  const normalizedValue = String(value ?? "").trim();

  if (!normalizedValue) {
    return DEFAULT_API_BASE_URL;
  }

  if (normalizedValue.startsWith("/")) {
    return normalizedValue.replace(/\/+$/, "") || DEFAULT_API_BASE_URL;
  }

  try {
    const url = new URL(normalizedValue);

    // Allow both https://backend.example.com and https://backend.example.com/api.
    if (!url.pathname || url.pathname === "/") {
      url.pathname = "/api";
    }

    return url.toString().replace(/\/+$/, "");
  } catch {
    return normalizedValue.replace(/\/+$/, "");
  }
}

export const API_BASE_URL = normalizeApiBaseUrl(runtimeConfig.apiBaseUrl);

export function buildApiUrl(path) {
  const rawPath = String(path ?? "").trim();
  const normalizedPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;

  return `${API_BASE_URL}${normalizedPath}`;
}
