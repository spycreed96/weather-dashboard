import { mountWeatherFeature } from "../features/weather/index.js";

export function bootstrapApp(root) {
  if (!root) {
    throw new Error("Frontend root element not found.");
  }

  mountWeatherFeature(root);
}

