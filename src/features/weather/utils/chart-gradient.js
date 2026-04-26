export const DEFAULT_TEMPERATURE_PALETTE = [
  [31, 120, 255],
  [127, 233, 255],
  [255, 216, 107],
  [255, 107, 75],
];

const DEFAULT_FILL_ALPHA = 0.34;
const STOP_EPSILON = 0.0001;
const chartGradientCache = new WeakMap();

export const gradientFillPlugin = {
  id: "gradientFillPlugin",
  beforeDatasetsDraw(chart, _args, pluginOptions = {}) {
    const chartArea = chart.chartArea;
    const yScale = chart.scales?.y;

    if (!chartArea || !yScale) {
      return;
    }

    const cache = getGradientCache(chart);

    (chart.data?.datasets || []).forEach((dataset, datasetIndex) => {
      if (!dataset || dataset.fill === false || dataset.gradientFill === false) {
        return;
      }

      const values = getNumericDatasetValues(dataset.data);
      if (!values.length) {
        return;
      }

      const resolvedOptions = resolveGradientOptions(pluginOptions, dataset);
      const pointOffsets = getDatasetPointOffsets(chart, datasetIndex, chartArea);
      const signature = createGradientSignature(chartArea, values, pointOffsets, resolvedOptions);
      const cachedGradient = cache.get(datasetIndex);

      if (!cachedGradient || cachedGradient.signature !== signature) {
        cache.set(datasetIndex, {
          signature,
          gradient: buildTemperatureGradient(chart, values, pointOffsets, chartArea, resolvedOptions),
        });
      }

      if (dataset.fill == null) {
        dataset.fill = true;
      }

      applyGradientToDataset(chart, datasetIndex, dataset, cache.get(datasetIndex).gradient);
    });
  },
  afterUpdate(chart) {
    chartGradientCache.delete(chart);
  },
  resize(chart) {
    chartGradientCache.delete(chart);
  },
  beforeDestroy(chart) {
    chartGradientCache.delete(chart);
  },
};

function getGradientCache(chart) {
  if (!chartGradientCache.has(chart)) {
    chartGradientCache.set(chart, new Map());
  }

  return chartGradientCache.get(chart);
}

function applyGradientToDataset(chart, datasetIndex, dataset, gradient) {
  dataset.backgroundColor = gradient;

  const meta = typeof chart.getDatasetMeta === "function" ? chart.getDatasetMeta(datasetIndex) : null;
  const datasetElementOptions = meta?.dataset?.options;
  const controllerOptions = meta?.controller?.options;

  if (datasetElementOptions) {
    datasetElementOptions.backgroundColor = gradient;
  }

  if (controllerOptions) {
    controllerOptions.backgroundColor = gradient;
  }
}

function buildTemperatureGradient(chart, values, pointOffsets, chartArea, options) {
  const gradient = chart.ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
  const { minTemp, maxTemp } = getTemperatureDomain(values);
  const offsets = pointOffsets.length === values.length ? pointOffsets : getFallbackOffsets(values.length);
  const colorStops = [
    { offset: 0, color: resolveTemperatureColor(values[0] ?? minTemp, minTemp, maxTemp, options) },
    ...values.map((value, index) => ({
      offset: offsets[index],
      color: resolveTemperatureColor(value, minTemp, maxTemp, options),
    })),
    { offset: 1, color: resolveTemperatureColor(values.at(-1) ?? maxTemp, minTemp, maxTemp, options) },
  ];

  normalizeColorStops(colorStops).forEach(({ offset, color }) => {
    gradient.addColorStop(offset, color);
  });

  return gradient;
}

function resolveGradientOptions(pluginOptions, dataset) {
  return {
    alpha: dataset.gradientFillAlpha ?? pluginOptions.alpha ?? DEFAULT_FILL_ALPHA,
    palette: normalizePalette(dataset.gradientFillPalette ?? pluginOptions.palette),
    useChroma: dataset.gradientFillUseChroma ?? pluginOptions.useChroma ?? false,
  };
}

function normalizePalette(palette) {
  if (!Array.isArray(palette) || palette.length < 2) {
    return DEFAULT_TEMPERATURE_PALETTE;
  }

  const normalized = palette
    .map((rgb) => (Array.isArray(rgb) && rgb.length === 3 ? rgb.map((channel) => clamp(channel, 0, 255)) : null))
    .filter(Boolean);

  return normalized.length >= 2 ? normalized : DEFAULT_TEMPERATURE_PALETTE;
}

function createGradientSignature(chartArea, values, pointOffsets, options) {
  const paletteKey = options.palette.map((rgb) => rgb.join(",")).join("|");

  return [
    chartArea.top,
    chartArea.bottom,
    chartArea.left,
    chartArea.right,
    values.map((value) => Number(value).toFixed(3)).join("|"),
    pointOffsets.map((offset) => Number(offset).toFixed(4)).join("|"),
    paletteKey,
    options.alpha,
    options.useChroma,
  ].join("::");
}

function getNumericDatasetValues(data) {
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((entry) => {
      if (typeof entry === "number") {
        return Number.isFinite(entry) ? entry : null;
      }

      const numericValue = Number(entry?.y);
      return Number.isFinite(numericValue) ? numericValue : null;
    })
    .filter((value) => value !== null);
}

function getTemperatureDomain(values) {
  return {
    minTemp: Math.min(...values),
    maxTemp: Math.max(...values),
  };
}

function getDatasetPointOffsets(chart, datasetIndex, chartArea) {
  const meta = typeof chart.getDatasetMeta === "function" ? chart.getDatasetMeta(datasetIndex) : null;
  const points = Array.isArray(meta?.data) ? meta.data : [];

  if (!points.length) {
    return [];
  }

  return points.map((point) => getOffsetForPixel(point?.x, chartArea.left, chartArea.right));
}

function getOffsetForPixel(pixelValue, start, end) {
  if (!Number.isFinite(pixelValue) || end <= start) {
    return 0;
  }

  return clamp((pixelValue - start) / (end - start), 0, 1);
}

function getFallbackOffsets(length) {
  if (length <= 1) {
    return [0.5];
  }

  return Array.from({ length }, (_, index) => index / (length - 1));
}

function resolveTemperatureColor(value, minTemp, maxTemp, options) {
  const normalizedValue = normalizeTemperature(value, minTemp, maxTemp);

  if (options.useChroma && typeof window !== "undefined" && typeof window.chroma === "function") {
    const chromaPalette = options.palette.map(([red, green, blue]) => `rgb(${red}, ${green}, ${blue})`);
    return window.chroma.scale(chromaPalette)(normalizedValue).alpha(options.alpha).css();
  }

  return toRgbaString(interpolatePaletteColor(options.palette, normalizedValue), options.alpha);
}

function normalizeTemperature(value, minTemp, maxTemp) {
  if (!Number.isFinite(value)) {
    return 0.5;
  }

  if (maxTemp <= minTemp) {
    return 0.5;
  }

  return clamp((value - minTemp) / (maxTemp - minTemp), 0, 1);
}

function interpolatePaletteColor(palette, normalizedValue) {
  if (palette.length === 1) {
    return palette[0];
  }

  const scaledIndex = normalizedValue * (palette.length - 1);
  const startIndex = Math.min(Math.floor(scaledIndex), palette.length - 2);
  const localProgress = scaledIndex - startIndex;
  const startColor = palette[startIndex];
  const endColor = palette[startIndex + 1];

  return startColor.map((channel, channelIndex) =>
    Math.round(channel + (endColor[channelIndex] - channel) * localProgress),
  );
}

function toRgbaString([red, green, blue], alpha) {
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function normalizeColorStops(colorStops) {
  return colorStops
    .map((stop) => ({
      offset: clamp(stop.offset, 0, 1),
      color: stop.color,
    }))
    .sort((left, right) => left.offset - right.offset)
    .reduce((stops, stop) => {
      const lastStop = stops.at(-1);

      if (lastStop && Math.abs(lastStop.offset - stop.offset) < STOP_EPSILON) {
        stops[stops.length - 1] = stop;
        return stops;
      }

      stops.push(stop);
      return stops;
    }, []);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
