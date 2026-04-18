import {
  capitalizeText,
  formatDetailTemperature,
  formatMillimeters,
  formatSpeed,
  formatTemperature,
  getWeatherIconUrl,
  renderDetailInlineTemperature,
  toNumericValue,
} from "../utils/weather-formatters.js";
import { buildAreaPath, buildSmoothPath, convertTemperatureValue } from "../utils/chart-helpers.js";

const INSIGHT_CHART_WIDTH = 320;
const INSIGHT_CHART_HEIGHT = 148;
const INSIGHT_CHART_PADDING = {
  top: 16,
  right: 18,
  bottom: 12,
  left: 12,
};

export function renderWeatherInsightsSection() {
  return `
    <section class="weather-insights" aria-labelledby="weather-insights-title">
      <div class="weather-insights-header">
        <h3 id="weather-insights-title">Dettagli Meteo</h3>
      </div>
      <div id="weather-insights-cards" class="weather-insights-grid" aria-live="polite">${renderWeatherInsightCards()}</div>
    </section>
  `;
}

export function renderWeatherInsightCards(weatherData = null, forecastDays = [], unit = "celsius") {
  const currentDay = findCurrentForecastDay(forecastDays);

  return [
    renderTemperatureInsightCard(weatherData, currentDay, unit),
    renderPerceivedInsightCard(weatherData, unit),
    renderCloudinessInsightCard(weatherData, currentDay),
    renderPrecipitationInsightCard(weatherData),
  ].join("");
}

function renderTemperatureInsightCard(weatherData, currentDay, unit) {
  const hourlyForecast = Array.isArray(currentDay?.hourly_forecast) ? currentDay.hourly_forecast : [];
  const currentPoint = hourlyForecast.find((point) => point?.is_now) || hourlyForecast.at(-1) || null;
  const currentTemperature = toNumericValue(
    weatherData?.temperature ?? currentPoint?.temperature ?? currentDay?.current_temperature,
  );

  if (currentTemperature === null && !hourlyForecast.length) {
    return renderEmptyInsightCard("Temperatura", "I dettagli della temperatura appariranno qui dopo il caricamento dei dati meteo.");
  }

  const temperaturePoints = hourlyForecast.length
    ? hourlyForecast
    : [{ time_label: "Adesso", temperature: currentTemperature ?? 0, is_now: true }];
  const trend = getTemperatureTrend(temperaturePoints, currentTemperature);
  const sparkline = renderTemperatureSparkline(temperaturePoints, unit);
  const description = buildTemperatureInsightCopy(temperaturePoints, currentTemperature, unit, trend.label);

  return `
    <article class="weather-insight-card weather-insight-card--temperature">
      <div class="weather-insight-card-header">
        <h4 class="weather-insight-card-title">Temperatura</h4>
        <div class="weather-insight-current" aria-label="${formatTemperature(currentTemperature, unit)}">
          ${renderDetailInlineTemperature(currentTemperature, unit)}
        </div>
      </div>

      <div class="weather-insight-sparkline">
        ${sparkline}
      </div>

      <div class="weather-insight-copy">
        <p class="weather-insight-status weather-insight-status--${trend.tone}">${trend.label}</p>
        <p class="weather-insight-description">${description}</p>
      </div>
    </article>
  `;
}

function renderPerceivedInsightCard(weatherData, unit) {
  const actualTemperature = toNumericValue(weatherData?.temperature);
  const feelsLikeTemperature = toNumericValue(weatherData?.feels_like);
  const humidity = toNumericValue(weatherData?.humidity);
  const windSpeed = toNumericValue(weatherData?.wind_speed);

  if (actualTemperature === null && feelsLikeTemperature === null) {
    return renderEmptyInsightCard("Percepita", "La temperatura percepita sara' disponibile non appena saranno caricati i dati correnti.");
  }

  const normalizedActual = actualTemperature ?? feelsLikeTemperature ?? 0;
  const normalizedFeelsLike = feelsLikeTemperature ?? actualTemperature ?? 0;
  const status = getPerceivedInsightStatus(normalizedActual, normalizedFeelsLike);
  const dominantFactor = getPerceivedDominantFactor(normalizedActual, normalizedFeelsLike, humidity, windSpeed);

  return `
    <article class="weather-insight-card weather-insight-card--perceived">
      <div class="weather-insight-card-header">
        <h4 class="weather-insight-card-title">Percepita</h4>
      </div>

      <div class="weather-insight-sparkline weather-insight-sparkline--compact">
        ${renderPerceivedSparkline(normalizedActual, normalizedFeelsLike, unit)}
      </div>

      <p class="weather-insight-meta">Fattore dominante: <strong>${capitalizeText(dominantFactor.label)}</strong></p>

      <div class="weather-insight-values">
        <div class="weather-insight-value-block">
          <span class="weather-insight-value-label">Percepita</span>
          <strong class="weather-insight-value" aria-label="${formatTemperature(normalizedFeelsLike, unit)}">${renderDetailInlineTemperature(normalizedFeelsLike, unit)}</strong>
        </div>
        <div class="weather-insight-value-block">
          <span class="weather-insight-value-label">Temperatura</span>
          <strong class="weather-insight-value" aria-label="${formatTemperature(normalizedActual, unit)}">${renderDetailInlineTemperature(normalizedActual, unit)}</strong>
        </div>
      </div>

      <div class="weather-insight-copy weather-insight-copy--compact">
        <p class="weather-insight-status weather-insight-status--${status.tone}">${status.label}</p>
        <p class="weather-insight-description">${buildPerceivedInsightCopy(normalizedActual, normalizedFeelsLike, humidity, windSpeed, unit, dominantFactor)}</p>
      </div>
    </article>
  `;
}

function renderCloudinessInsightCard(weatherData, currentDay) {
  const cloudiness = toNumericValue(weatherData?.cloudiness);

  if (cloudiness === null) {
    return renderEmptyInsightCard("Nuvolosita'", "La copertura nuvolosa apparira' qui quando il backend fornira' i dati aggiornati.");
  }

  const cloudinessInsight = getCloudinessInsight(cloudiness);
  const iconUrl = getWeatherIconUrl(weatherData?.icon ?? currentDay?.icon, "2x");
  const description = buildCloudinessInsightCopy(weatherData, currentDay, cloudiness, cloudinessInsight.label);

  return `
    <article class="weather-insight-card weather-insight-card--cloudiness">
      <div class="weather-insight-card-header">
        <h4 class="weather-insight-card-title">Nuvolosita'</h4>
      </div>

      <div class="weather-insight-disc weather-insight-disc--cloudiness">
        ${iconUrl ? `<img class="weather-insight-disc-icon" src="${iconUrl}" alt="${weatherData?.description || cloudinessInsight.label}" />` : '<span class="weather-insight-disc-icon-placeholder">Cloud</span>'}
        <strong class="weather-insight-disc-title">${cloudinessInsight.label}</strong>
        <span class="weather-insight-disc-subtitle">${cloudiness}% copertura</span>
      </div>

      <div class="weather-insight-copy">
        <p class="weather-insight-status weather-insight-status--${cloudinessInsight.tone}">${cloudinessInsight.label} (${cloudiness}%)</p>
        <p class="weather-insight-description">${description}</p>
      </div>
    </article>
  `;
}

function renderPrecipitationInsightCard(weatherData) {
  const precipitationNext24h = toNumericValue(weatherData?.precipitation_next_24h);

  if (precipitationNext24h === null) {
    return renderEmptyInsightCard("Precipitazioni", "L'accumulo previsto nelle prossime 24 ore comparira' qui dopo il caricamento del forecast.");
  }

  const precipitationInsight = getPrecipitationInsight(precipitationNext24h);

  return `
    <article class="weather-insight-card weather-insight-card--precipitation">
      <div class="weather-insight-card-header">
        <h4 class="weather-insight-card-title">Precipitazioni</h4>
      </div>

      <div class="weather-insight-disc weather-insight-disc--precipitation">
        <div class="weather-insight-precipitation-value">
          <span>${formatMillimeters(precipitationNext24h)}</span>
          <small>mm</small>
        </div>
        <span class="weather-insight-disc-subtitle">Nelle prossime 24 ore</span>
      </div>

      <div class="weather-insight-copy">
        <p class="weather-insight-status weather-insight-status--${precipitationInsight.tone}">${precipitationInsight.label}</p>
        <p class="weather-insight-description">${buildPrecipitationInsightCopy(precipitationNext24h, precipitationInsight.label)}</p>
      </div>
    </article>
  `;
}

function renderEmptyInsightCard(title, copy) {
  return `
    <article class="weather-insight-card weather-insight-card--empty" aria-label="Dettaglio ${title.toLowerCase()} non disponibile">
      <div class="weather-insight-card-header">
        <h4 class="weather-insight-card-title">${title}</h4>
      </div>
      <p class="weather-insight-empty-copy">${copy}</p>
    </article>
  `;
}

function findCurrentForecastDay(forecastDays) {
  return (
    forecastDays.find(
      (day) => Array.isArray(day?.hourly_forecast) && day.hourly_forecast.some((point) => point?.is_now),
    ) || forecastDays.find((day) => day?.label?.toLowerCase() === "oggi") || null
  );
}

function getTemperatureTrend(points, currentTemperature) {
  const currentIndex = points.findIndex((point) => point?.is_now);
  const relevantPoints = currentIndex >= 0 ? points.slice(currentIndex) : points;
  const temperatures = relevantPoints
    .map((point) => toNumericValue(point?.temperature))
    .filter((value) => value !== null);
  const referenceValue = toNumericValue(currentTemperature) ?? temperatures[0] ?? 0;
  const endValue = temperatures.at(-1) ?? referenceValue;
  const span = temperatures.length ? Math.max(...temperatures) - Math.min(...temperatures) : 0;

  if (span <= 3) {
    return { label: "Costante", tone: "steady" };
  }

  if (endValue >= referenceValue + 3) {
    return { label: "In rialzo", tone: "rise" };
  }

  if (endValue <= referenceValue - 3) {
    return { label: "In calo", tone: "drop" };
  }

  return { label: "Variabile", tone: "mixed" };
}

function buildTemperatureInsightCopy(points, currentTemperature, unit, trendLabel) {
  const referenceValue = toNumericValue(currentTemperature);
  const currentValueLabel = formatDetailTemperature(referenceValue, unit);
  const lead = {
    Costante: `Stabile al valore corrente di ${currentValueLabel}.`,
    "In rialzo": `Tende a salire rispetto al valore corrente di ${currentValueLabel}.`,
    "In calo": `Scende rispetto al valore corrente di ${currentValueLabel}.`,
    Variabile: `Oscilla attorno al valore corrente di ${currentValueLabel}.`,
  }[trendLabel] || `Valore corrente di ${currentValueLabel}.`;

  const nightLowPoint = getNighttimeLowPoint(points);
  if (nightLowPoint) {
    return `${lead} Durante la notte minimo di ${formatDetailTemperature(nightLowPoint.temperature, unit)} alle ${nightLowPoint.time_label}.`;
  }

  const minimumPoint = getMinimumTemperaturePoint(points);
  if (minimumPoint?.time_label) {
    return `${lead} Minimo previsto di ${formatDetailTemperature(minimumPoint.temperature, unit)} alle ${minimumPoint.time_label}.`;
  }

  return lead;
}

function getNighttimeLowPoint(points) {
  const nightPoints = points.filter((point) => {
    const hour = getHourFromTimeLabel(point?.time_label);

    return hour !== null && hour >= 0 && hour < 8;
  });

  return getMinimumTemperaturePoint(nightPoints);
}

function getMinimumTemperaturePoint(points) {
  const validPoints = points.filter((point) => toNumericValue(point?.temperature) !== null);

  if (!validPoints.length) {
    return null;
  }

  return validPoints.reduce((lowestPoint, point) =>
    toNumericValue(point.temperature) < toNumericValue(lowestPoint.temperature) ? point : lowestPoint,
  );
}

function getHourFromTimeLabel(timeLabel) {
  const match = typeof timeLabel === "string" ? timeLabel.match(/^(\d{1,2}):(\d{2})$/) : null;

  if (!match) {
    return null;
  }

  return Number(match[1]) + Number(match[2]) / 60;
}

function getPerceivedInsightStatus(actualTemperature, feelsLikeTemperature) {
  const delta = feelsLikeTemperature - actualTemperature;

  if (delta >= 5) {
    return { label: "Molto piu' caldo", tone: "warm" };
  }

  if (delta >= 2) {
    return { label: "Leggermente caldo", tone: "warm" };
  }

  if (delta <= -5) {
    return { label: "Molto piu' fresco", tone: "cool" };
  }

  if (delta <= -2) {
    return { label: "Piu' fresco", tone: "cool" };
  }

  return { label: "Allineata", tone: "neutral" };
}

function getPerceivedDominantFactor(actualTemperature, feelsLikeTemperature, humidity, windSpeed) {
  const delta = feelsLikeTemperature - actualTemperature;

  if (delta >= 2 && humidity !== null && humidity >= 65) {
    return { label: "umidita'", detail: `con umidita' al ${Math.round(humidity)}%` };
  }

  if (delta <= -2 && windSpeed !== null && windSpeed >= 12) {
    return { label: "vento", detail: `con vento attorno a ${formatSpeed(windSpeed)}` };
  }

  if (delta >= 2) {
    return { label: "accumulo termico", detail: "nelle ore piu' esposte" };
  }

  if (delta <= -2) {
    return { label: "vento", detail: windSpeed !== null ? `con raffiche attorno a ${formatSpeed(windSpeed)}` : "nelle zone piu' aperte" };
  }

  return { label: "equilibrio termico", detail: "tra temperatura reale e sensazione percepita" };
}

function buildPerceivedInsightCopy(actualTemperature, feelsLikeTemperature, humidity, windSpeed, unit, dominantFactor) {
  const actualLabel = formatDetailTemperature(actualTemperature, unit);
  const feelsLikeLabel = formatDetailTemperature(feelsLikeTemperature, unit);
  const delta = feelsLikeTemperature - actualTemperature;
  const absoluteDeltaLabel = formatDetailTemperature(Math.abs(delta), unit);

  if (Math.abs(delta) < 2) {
    return `La sensazione termica resta vicina alla temperatura reale di ${actualLabel}, con ${capitalizeText(dominantFactor.label)} ${dominantFactor.detail}.`;
  }

  if (delta > 0) {
    return `Si sentono ${feelsLikeLabel}, circa ${absoluteDeltaLabel} in piu' dei ${actualLabel} misurati, soprattutto per ${dominantFactor.detail || dominantFactor.label}.`;
  }

  return `La sensazione scende a ${feelsLikeLabel}, circa ${absoluteDeltaLabel} in meno dei ${actualLabel} registrati, complice ${dominantFactor.detail || dominantFactor.label}.`;
}

function getCloudinessInsight(cloudiness) {
  if (cloudiness <= 10) {
    return { label: "Sereno", tone: "clear" };
  }

  if (cloudiness <= 30) {
    return { label: "Soleggiato", tone: "clear" };
  }

  if (cloudiness <= 55) {
    return { label: "Variabile", tone: "mixed" };
  }

  if (cloudiness <= 85) {
    return { label: "Nuvoloso", tone: "cloudy" };
  }

  return { label: "Coperto", tone: "cloudy" };
}

function buildCloudinessInsightCopy(weatherData, currentDay, cloudiness, label) {
  const description = capitalizeText((weatherData?.description || currentDay?.description || label).trim());
  const outlook = cloudiness <= 30
    ? "Il cielo resta abbastanza aperto nel resto della giornata."
    : cloudiness <= 60
      ? "La copertura resta alternata tra aperture e passaggi nuvolosi."
      : "La copertura resta presente anche nelle prossime ore.";

  return `Copertura stimata al ${cloudiness}%. ${description}. ${outlook}`;
}

function getPrecipitationInsight(precipitationNext24h) {
  if (precipitationNext24h <= 0.05) {
    return { label: "Nessuna precipitazione", tone: "dry" };
  }

  if (precipitationNext24h < 2) {
    return { label: "Piovaschi isolati", tone: "rain" };
  }

  if (precipitationNext24h < 8) {
    return { label: "Piogge deboli", tone: "rain" };
  }

  if (precipitationNext24h < 18) {
    return { label: "Piogge moderate", tone: "alert" };
  }

  return { label: "Piogge intense", tone: "alert" };
}

function buildPrecipitationInsightCopy(precipitationNext24h, label) {
  if (precipitationNext24h <= 0.05) {
    return "Nessuna precipitazione prevista nelle prossime 24 ore.";
  }

  if (precipitationNext24h < 2) {
    return `Accumulo molto contenuto, pari a ${formatMillimeters(precipitationNext24h)} mm nelle prossime 24 ore.`;
  }

  return `${label} con accumulo stimato di ${formatMillimeters(precipitationNext24h)} mm nelle prossime 24 ore.`;
}

function renderTemperatureSparkline(points, unit) {
  const plotPoints = buildInsightPlotPoints(points, unit);

  return renderInsightSparkline(plotPoints, {
    ariaLabel: "Andamento della temperatura corrente",
    gradientId: "weather-insight-area-gradient-temperature",
    lineClass: "weather-insight-line",
    tailClass: "weather-insight-line weather-insight-line--tail",
    pointClass: "weather-insight-point",
    highlightIndex: Math.max(
      plotPoints.findIndex((point) => point?.is_now),
      0,
    ),
  });
}

function renderPerceivedSparkline(actualTemperature, feelsLikeTemperature, unit) {
  const delta = feelsLikeTemperature - actualTemperature;
  const values = [
    actualTemperature,
    actualTemperature + delta * 0.2,
    actualTemperature + delta * 0.65,
    feelsLikeTemperature,
    feelsLikeTemperature - delta * 0.18,
  ];
  const plotPoints = buildNumericPlotPoints(values, unit);

  return renderInsightSparkline(plotPoints, {
    ariaLabel: "Confronto fra temperatura percepita e reale",
    gradientId: "weather-insight-area-gradient-perceived",
    lineClass: "weather-insight-line weather-insight-line--perceived",
    tailClass: "weather-insight-line weather-insight-line--perceived-tail",
    pointClass: "weather-insight-point weather-insight-point--perceived",
    highlightIndex: Math.min(3, Math.max(plotPoints.length - 1, 0)),
  });
}

function renderInsightSparkline(
  plotPoints,
  { ariaLabel, gradientId, lineClass, tailClass = "", pointClass, highlightIndex = 0 },
) {
  if (!plotPoints.length) {
    return "";
  }

  const baselineY = INSIGHT_CHART_HEIGHT - INSIGHT_CHART_PADDING.bottom;
  const areaPath = buildAreaPath(plotPoints, baselineY);
  const safeHighlightIndex = Math.min(Math.max(highlightIndex, 0), plotPoints.length - 1);
  const highlightPoint = plotPoints[safeHighlightIndex] || plotPoints.at(-1);
  const leadingPath = buildSmoothPath(plotPoints.slice(0, safeHighlightIndex + 1));
  const trailingPath = safeHighlightIndex < plotPoints.length - 1 ? buildSmoothPath(plotPoints.slice(safeHighlightIndex)) : "";

  return `
    <svg class="weather-insight-svg" viewBox="0 0 ${INSIGHT_CHART_WIDTH} ${INSIGHT_CHART_HEIGHT}" role="img" aria-label="${ariaLabel}">
      <defs>
        <linearGradient id="${gradientId}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="rgba(72, 194, 255, 0.34)" />
          <stop offset="100%" stop-color="rgba(72, 194, 255, 0.06)" />
        </linearGradient>
      </defs>

      <path class="weather-insight-area" style="fill: url(#${gradientId});" d="${areaPath}" />
      ${trailingPath && tailClass ? `<path class="${tailClass}" d="${trailingPath}" />` : ""}
      <path class="${lineClass}" d="${leadingPath}" />
      <circle class="${pointClass}" cx="${highlightPoint.x}" cy="${highlightPoint.y}" r="11" />
    </svg>
  `;
}

function buildInsightPlotPoints(points, unit) {
  const validPoints = points.filter((point) => toNumericValue(point?.temperature) !== null);

  if (!validPoints.length) {
    return [];
  }

  const plotWidth = INSIGHT_CHART_WIDTH - INSIGHT_CHART_PADDING.left - INSIGHT_CHART_PADDING.right;
  const plotHeight = INSIGHT_CHART_HEIGHT - INSIGHT_CHART_PADDING.top - INSIGHT_CHART_PADDING.bottom;
  const chartValues = validPoints.map((point) => convertTemperatureValue(point.temperature, unit));
  const minValue = Math.min(...chartValues);
  const maxValue = Math.max(...chartValues);
  const safeRange = Math.max(maxValue - minValue, 4);
  const lowerBound = Math.floor(minValue - 1);
  const upperBound = Math.ceil(maxValue + 1);
  const normalizedRange = Math.max(upperBound - lowerBound, safeRange);
  const xStep = validPoints.length > 1 ? plotWidth / (validPoints.length - 1) : 0;

  return validPoints.map((point, index) => ({
    ...point,
    x: INSIGHT_CHART_PADDING.left + xStep * index,
    y:
      INSIGHT_CHART_HEIGHT -
      INSIGHT_CHART_PADDING.bottom -
      ((chartValues[index] - lowerBound) / normalizedRange) * plotHeight,
  }));
}

function buildNumericPlotPoints(values, unit) {
  const numericValues = values.map((value) => toNumericValue(value)).filter((value) => value !== null);

  if (!numericValues.length) {
    return [];
  }

  const plotWidth = INSIGHT_CHART_WIDTH - INSIGHT_CHART_PADDING.left - INSIGHT_CHART_PADDING.right;
  const plotHeight = INSIGHT_CHART_HEIGHT - INSIGHT_CHART_PADDING.top - INSIGHT_CHART_PADDING.bottom;
  const chartValues = numericValues.map((value) => convertTemperatureValue(value, unit));
  const minValue = Math.min(...chartValues);
  const maxValue = Math.max(...chartValues);
  const safeRange = Math.max(maxValue - minValue, 4);
  const lowerBound = Math.floor(minValue - 1);
  const upperBound = Math.ceil(maxValue + 1);
  const normalizedRange = Math.max(upperBound - lowerBound, safeRange);
  const xStep = chartValues.length > 1 ? plotWidth / (chartValues.length - 1) : 0;

  return chartValues.map((value, index) => ({
    x: INSIGHT_CHART_PADDING.left + xStep * index,
    y:
      INSIGHT_CHART_HEIGHT -
      INSIGHT_CHART_PADDING.bottom -
      ((value - lowerBound) / normalizedRange) * plotHeight,
  }));
}