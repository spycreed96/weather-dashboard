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

let activeRoute = null;
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

  const route = getCurrentRoute();

  if (!ROUTES[route]) {
    window.location.hash = DEFAULT_ROUTE;
    return;
  }

  if (activeRoute === route) {
    updateAppNavState(appRoot, route);
    return;
  }

  if (activeRoute) {
    ROUTES[activeRoute]?.unmount();
  }

  routeRoot.replaceChildren();
  activeRoute = route;
  ROUTES[route].mount(routeRoot);
  updateAppNavState(appRoot, route);
}

function getCurrentRoute() {
  return window.location.hash.replace(/^#\/?/, "") || DEFAULT_ROUTE;
}
