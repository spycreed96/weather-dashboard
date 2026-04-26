import { mountFavorites, unmountFavorites } from "../features/favorites/index.js";
import { mountWeather, unmountWeather } from "../features/weather/index.js";
import { updateAppNavState } from "../shared/components/app-shell.js";

const DEFAULT_ROUTE = "forecast";
const ROUTES = {
  favorites: {
    mount: mountFavorites,
    unmount: unmountFavorites,
  },
  forecast: {
    mount: mountWeather,
    unmount: unmountWeather,
  },
};

let activeRouteId = null;
let activeRoutePath = null;
let appRoot = null;
let routeRoot = null;

export function bootstrapApp(root) {
  if (!root) {
    throw new Error("Frontend root element not found.");
  }

  appRoot = root;
  appRoot.innerHTML = `
    <main class="app-container app-page-shell">
      <div id="route-view" class="app-route-view"></div>
    </main>
  `;
  routeRoot = appRoot.querySelector("#route-view");

  window.addEventListener("hashchange", handleRoute);
  handleRoute();
}

export function handleRoute() {
  if (!routeRoot || !appRoot) {
    return;
  }

  const route = getCurrentRouteState();

  if (!ROUTES[route.id]) {
    window.location.hash = DEFAULT_ROUTE;
    return;
  }

  if (activeRouteId === route.id && activeRoutePath === route.fullPath) {
    updateAppNavState(appRoot, route.id);
    return;
  }

  if (activeRouteId) {
    ROUTES[activeRouteId]?.unmount();
  }

  routeRoot.replaceChildren();
  activeRouteId = route.id;
  activeRoutePath = route.fullPath;
  ROUTES[route.id].mount(routeRoot, route);
  updateAppNavState(appRoot, route.id);
}

function getCurrentRouteState() {
  const normalizedPath = normalizeHashPath(window.location.hash);
  const fullPath = normalizedPath || DEFAULT_ROUTE;
  const [id = DEFAULT_ROUTE, ...pathSegments] = fullPath.split("/");

  return {
    fullPath,
    id,
    pathSegments,
  };
}

function normalizeHashPath(hash) {
  return String(hash || "")
    .replace(/^#\/?/, "")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/+|\/+$/g, "");
}
