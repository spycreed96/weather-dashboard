import {
  capitalizeText,
  formatDetailTemperature,
  formatMillimeters,
  formatSpeed,
  formatTemperature,
  getAirQualityPresentation,
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
const TEMPERATURE_TREND_WINDOW_POINTS = 3;
const GAUGE_START_ANGLE = -140;
const GAUGE_END_ANGLE = 140;
const GAUGE_SWEEP_ANGLE = GAUGE_END_ANGLE - GAUGE_START_ANGLE;

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
    renderWindInsightCard(weatherData),
    renderHumidityInsightCard(weatherData, unit),
    renderUvInsightCard(weatherData),
    renderPollenInsightCard(weatherData),
    renderVisibilityInsightCard(weatherData),
    renderPressureInsightCard(weatherData),
    renderAirQualityInsightCard(weatherData),
    renderMoonInsightCard(weatherData),
    renderMoonPhaseInsightCard(weatherData),
    renderSunInsightCard(weatherData),
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

function renderWindInsightCard(weatherData) {
  const windSpeed = toNumericValue(weatherData?.wind_speed);
  const windGust = toNumericValue(weatherData?.wind_gust);
  const windDirection = toNumericValue(weatherData?.wind_direction);

  if (windSpeed === null && windGust === null) {
    return renderEmptyInsightCard("Vento", "Velocita', raffiche e direzione del vento appariranno qui quando i dati correnti saranno disponibili.");
  }

  const resolvedSpeed = windSpeed ?? windGust ?? 0;
  const resolvedGust = windGust ?? windSpeed ?? resolvedSpeed;
  const windInsight = getWindInsight(resolvedSpeed, resolvedGust);
  const direction = getWindDirectionLabel(windDirection);
  const heading = direction && windDirection !== null ? `Da ${direction.short} (${Math.round(windDirection)}°)` : "Direzione variabile";

  return `
    <article class="weather-insight-card weather-insight-card--wind">
      <div class="weather-insight-card-header">
        <h4 class="weather-insight-card-title">Vento</h4>
      </div>

      <div class="weather-insight-wind-layout">
        ${renderWindCompass(windDirection)}

        <div class="weather-insight-wind-metrics">
          <p class="weather-insight-mini-label">${heading}</p>

          <div class="weather-insight-wind-reading">
            <strong>${formatWholeInsightNumber(resolvedSpeed)}</strong>
            <span>km/h</span>
          </div>
          <p class="weather-insight-wind-reading-caption">Velocita' media</p>

          <div class="weather-insight-wind-reading weather-insight-wind-reading--secondary">
            <strong>${formatWholeInsightNumber(resolvedGust)}</strong>
            <span>km/h</span>
          </div>
          <p class="weather-insight-wind-reading-caption">Raffiche</p>
        </div>
      </div>

      <div class="weather-insight-copy">
        <p class="weather-insight-status weather-insight-status--${windInsight.tone}">${windInsight.label}</p>
        <p class="weather-insight-description">${buildWindInsightCopy(resolvedSpeed, resolvedGust, direction)}</p>
      </div>
    </article>
  `;
}

function renderHumidityInsightCard(weatherData, unit) {
  const humidity = toNumericValue(weatherData?.humidity);
  const dewPoint = toNumericValue(weatherData?.dew_point);

  if (humidity === null && dewPoint === null) {
    return renderEmptyInsightCard("Umidita'", "Umidita' relativa e punto di rugiada saranno mostrati qui non appena saranno disponibili i dati correnti.");
  }

  const normalizedHumidity = humidity ?? 0;
  const humidityInsight = getHumidityInsight(normalizedHumidity, dewPoint);

  return `
    <article class="weather-insight-card weather-insight-card--humidity">
      <div class="weather-insight-card-header">
        <h4 class="weather-insight-card-title">Umidita'</h4>
      </div>

      <div class="weather-insight-humidity-layout">
        <div class="weather-insight-humidity-bars" aria-hidden="true">
          ${renderHumidityBars(normalizedHumidity)}
        </div>

        <div class="weather-insight-humidity-stats">
          <div class="weather-insight-humidity-stat">
            <strong class="weather-insight-humidity-value">
              <span class="weather-insight-humidity-number">${formatWholeInsightNumber(normalizedHumidity)}</span>
              <small class="weather-insight-humidity-unit">%</small>
            </strong>
            <span class="weather-insight-humidity-caption">Umidita' relativa</span>
          </div>

          <div class="weather-insight-humidity-stat weather-insight-humidity-stat--secondary">
            <strong class="weather-insight-humidity-value weather-insight-humidity-value--temperature" aria-label="${formatDetailTemperature(dewPoint, unit)}">${renderDetailInlineTemperature(dewPoint, unit)}</strong>
            <span class="weather-insight-humidity-caption">Punto di rugiada</span>
          </div>
        </div>
      </div>

      <div class="weather-insight-copy">
        <p class="weather-insight-status weather-insight-status--${humidityInsight.tone}">${humidityInsight.label}</p>
        <p class="weather-insight-description">${buildHumidityInsightCopy(normalizedHumidity, dewPoint, unit)}</p>
      </div>
    </article>
  `;
}

function renderUvInsightCard(weatherData) {
  const uvToday = toNumericValue(weatherData?.uv_index);
  const uvTomorrow = toNumericValue(weatherData?.uv_index_tomorrow);
  const displayUv = uvTomorrow ?? uvToday;
  const isTomorrowForecast = uvTomorrow !== null;

  if (displayUv === null) {
    return renderEmptyInsightCard("UV", "L'indice UV massimo apparira' qui non appena il forecast giornaliero sara' disponibile.");
  }

  const uvInsight = getUvInsight(displayUv);
  const summaryLabel = isTomorrowForecast ? "Massimo previsto domani" : "Massimo previsto oggi";
  const displayUvLabel = formatWholeInsightNumber(displayUv);

  return `
    <article class="weather-insight-card weather-insight-card--uv">
      <div class="weather-insight-card-header">
        <h4 class="weather-insight-card-title">UV</h4>
      </div>

      <div class="weather-insight-gauge-shell weather-insight-gauge-shell--uv">
        ${renderSegmentedGauge({
          value: displayUv,
          maxValue: 12,
          ariaLabel: `Indice UV ${displayUvLabel}`,
          markerColor: uvInsight.markerColor,
          segments: [
            { stop: 2, color: "#77c93a" },
            { stop: 5, color: "#ffe147" },
            { stop: 7, color: "#ff9d28" },
            { stop: 10, color: "#df4545" },
            { stop: 12, color: "#7c3ec9" },
          ],
        })}

        <div class="weather-insight-gauge-center weather-insight-gauge-center--stacked">
          <strong>${displayUvLabel}</strong>
          <span>${summaryLabel}</span>
        </div>
      </div>

      <div class="weather-insight-copy">
        <p class="weather-insight-status weather-insight-status--${uvInsight.tone}">${uvInsight.label}</p>
        <p class="weather-insight-description">${buildUvInsightCopy(displayUv, isTomorrowForecast, uvInsight.label)}</p>
      </div>
    </article>
  `;
}

function renderPollenInsightCard(weatherData) {
  const pollenIndex = toNumericValue(weatherData?.pollen_index);
  const pollenLevel = weatherData?.pollen_level || null;
  const primaryAllergy = weatherData?.pollen_primary_allergy || null;
  const hasPollenData = pollenIndex !== null && pollenLevel !== null;
  const displayPollenIndex = pollenIndex ?? 0;
  const pollenInsight = getPollenInsight(displayPollenIndex, hasPollenData);

  return `
    <article class="weather-insight-card weather-insight-card--pollen">
      <div class="weather-insight-card-header">
        <h4 class="weather-insight-card-title">Polline</h4>
      </div>

      <div class="weather-insight-gauge-shell weather-insight-gauge-shell--pollen">
        ${renderSegmentedGauge({
          value: displayPollenIndex,
          maxValue: 100,
          ariaLabel: hasPollenData ? `Indice pollinico ${formatWholeInsightNumber(displayPollenIndex)}` : "Indice pollinico non disponibile",
          markerColor: pollenInsight.markerColor,
          segments: [
            { stop: 25, color: "#52d433" },
            { stop: 50, color: "#9ad816" },
            { stop: 75, color: "#ffd34a" },
            { stop: 100, color: "#ff9d37" },
          ],
        })}

        <div class="weather-insight-gauge-center weather-insight-gauge-center--stacked">
          <strong>${hasPollenData ? formatWholeInsightNumber(displayPollenIndex) : "--"}</strong>
        </div>
      </div>

      <div class="weather-insight-pollen-summary">
        <span class="weather-insight-pollen-summary-label">Allergia principale:</span>
        <strong class="weather-insight-pollen-summary-value">${primaryAllergy || "n.d."}</strong>
      </div>

      <div class="weather-insight-copy">
        <p class="weather-insight-status weather-insight-status--${pollenInsight.tone}">${pollenInsight.label}</p>
        <p class="weather-insight-description">${buildPollenInsightCopy(pollenLevel, primaryAllergy, hasPollenData)}</p>
      </div>
    </article>
  `;
}

function renderVisibilityInsightCard(weatherData) {
  const visibility = toNumericValue(weatherData?.visibility);

  if (visibility === null) {
    return renderEmptyInsightCard("Visibilita'", "La distanza di visibilita' comparira' qui non appena i dati correnti saranno disponibili.");
  }

  const visibilityInsight = getVisibilityInsight(visibility);

  return `
    <article class="weather-insight-card weather-insight-card--visibility">
      <div class="weather-insight-card-header">
        <h4 class="weather-insight-card-title">Visibilita'</h4>
      </div>

      <div class="weather-insight-visibility-graphic" aria-hidden="true">
        ${renderVisibilityBars(visibility)}
      </div>

      <div class="weather-insight-visibility-value">
        <strong>${formatWholeInsightNumber(visibility)}</strong>
        <span>km</span>
      </div>

      <div class="weather-insight-copy">
        <p class="weather-insight-status weather-insight-status--${visibilityInsight.tone}">${visibilityInsight.label}</p>
        <p class="weather-insight-description">${buildVisibilityInsightCopy(visibility)}</p>
      </div>
    </article>
  `;
}

function renderPressureInsightCard(weatherData) {
  const pressure = toNumericValue(weatherData?.pressure);
  const pressureTomorrow = toNumericValue(weatherData?.pressure_tomorrow);

  if (pressure === null) {
    return renderEmptyInsightCard("Pressione", "La pressione atmosferica e la sua tendenza saranno mostrate qui dopo il caricamento dei dati correnti.");
  }

  const pressureTrend = getPressureTrend(pressure, pressureTomorrow);

  return `
    <article class="weather-insight-card weather-insight-card--pressure">
      <div class="weather-insight-card-header">
        <h4 class="weather-insight-card-title">Pressione</h4>
      </div>

      <div class="weather-insight-pressure-graphic">
        ${renderPressureTrendGraphic(pressure, pressureTomorrow)}
      </div>

      <div class="weather-insight-pressure-reading">
        <strong>${formatWholeInsightNumber(pressure)}</strong>
        <span>hPa</span>
      </div>
      <p class="weather-insight-mini-label">${getCurrentTimeLabel()} (Ora)</p>

      <div class="weather-insight-copy">
        <p class="weather-insight-status weather-insight-status--${pressureTrend.tone}">${pressureTrend.label}</p>
        <p class="weather-insight-description">${buildPressureInsightCopy(pressure, pressureTomorrow)}</p>
      </div>
    </article>
  `;
}

function renderMoonPhaseInsightCard(weatherData) {
  const moonPhaseLabel = weatherData?.moon_phase_label || null;
  const moonIllumination = toNumericValue(weatherData?.moon_illumination);
  const nextFullMoonDate = weatherData?.next_full_moon_date || null;

  if (moonPhaseLabel === null && moonIllumination === null) {
    return renderEmptyInsightCard("Fase lunare", "La fase della luna comparira' qui quando il forecast astronomico sara' disponibile.");
  }

  return `
    <article class="weather-insight-card weather-insight-card--moon-phase">
      <div class="weather-insight-card-header">
        <h4 class="weather-insight-card-title">Fase lunare</h4>
      </div>

      <div class="weather-insight-moon-phase-layout">
        <div class="weather-insight-moon-phase-graphic">
          ${renderMoonPhaseDisc(moonIllumination, moonPhaseLabel)}
        </div>

        <div class="weather-insight-moon-phase-stats">
          <strong>${moonIllumination === null ? "--" : `${formatWholeInsightNumber(moonIllumination)}%`}</strong>
          <span>Fase della luna</span>
        </div>
      </div>

      <div class="weather-insight-moon-phase-next">
        <span class="weather-insight-moon-phase-dot" aria-hidden="true"></span>
        <div class="weather-insight-moon-phase-next-copy">
          <span>Prossima luna piena</span>
          <strong>${formatShortItalianDate(nextFullMoonDate)}</strong>
        </div>
      </div>
    </article>
  `;
}

function renderSunInsightCard(weatherData) {
  const sunriseTime = weatherData?.sunrise_time || null;
  const sunsetTime = weatherData?.sunset_time || null;
  const sunVisibilityMinutes = toNumericValue(weatherData?.sun_visibility_minutes);
  const sunProgress = toNumericValue(weatherData?.sun_progress);

  if (!sunriseTime && !sunsetTime) {
    return renderEmptyInsightCard("Sole", "Alba e tramonto del sole compariranno qui quando il forecast astronomico sara' disponibile.");
  }

  return `
    <article class="weather-insight-card weather-insight-card--sun">
      <div class="weather-insight-card-header">
        <h4 class="weather-insight-card-title">Sole</h4>
      </div>

      <div class="weather-insight-sun-graphic">
        ${renderSunGraphic(sunProgress)}
      </div>

      <p class="weather-insight-sun-duration">${formatDurationMinutes(sunVisibilityMinutes)}</p>

      <div class="weather-insight-sun-times">
        <div class="weather-insight-sun-time-block">
          <strong>${sunriseTime || "--:--"}</strong>
          <span>Alba</span>
        </div>
        <div class="weather-insight-sun-time-block weather-insight-sun-time-block--end">
          <strong>${sunsetTime || "--:--"}</strong>
          <span>Tramonto</span>
        </div>
      </div>
    </article>
  `;
}

function renderMoonInsightCard(weatherData) {
  const moonriseTime = weatherData?.moonrise_time || null;
  const moonsetTime = weatherData?.moonset_time || null;
  const moonVisibilityMinutes = toNumericValue(weatherData?.moon_visibility_minutes);
  const moonPhaseLabel = weatherData?.moon_phase_label || "Fase non disponibile";
  const moonProgress = toNumericValue(weatherData?.moon_progress);

  if (!moonriseTime && !moonsetTime) {
    return renderEmptyInsightCard("Luna", "Sorger e tramonto della luna compariranno qui quando il forecast astronomico sara' disponibile.");
  }

  return `
    <article class="weather-insight-card weather-insight-card--moon">
      <div class="weather-insight-card-header">
        <h4 class="weather-insight-card-title">Luna</h4>
      </div>

      <div class="weather-insight-moon-graphic">
        ${renderMoonGraphic(moonProgress)}
      </div>

      <p class="weather-insight-moon-duration">${formatDurationMinutes(moonVisibilityMinutes)}</p>

      <div class="weather-insight-moon-times">
        <div class="weather-insight-moon-time-block">
          <strong>${moonriseTime || "--:--"}</strong>
          <span>Sorge</span>
        </div>
        <div class="weather-insight-moon-time-block weather-insight-moon-time-block--end">
          <strong>${moonsetTime || "--:--"}</strong>
          <span>Tramonta</span>
        </div>
      </div>

      <div class="weather-insight-copy">
        <p class="weather-insight-status weather-insight-status--lunar">${moonPhaseLabel}</p>
        <p class="weather-insight-description">${buildMoonInsightCopy(moonriseTime, moonsetTime, moonVisibilityMinutes, moonPhaseLabel)}</p>
      </div>
    </article>
  `;
}

function renderAirQualityInsightCard(weatherData) {
  const airQuality = weatherData?.air_quality || "N/A";
  const airQualityIndex = toNumericValue(weatherData?.air_quality_index);
  const pollutant = weatherData?.air_quality_primary_pollutant || "";
  const pollutantValue = toNumericValue(weatherData?.air_quality_primary_pollutant_value);
  const pollutantUnit = weatherData?.air_quality_primary_pollutant_unit || "";

  if (airQuality === "N/A" && airQualityIndex === null) {
    return renderEmptyInsightCard("AQI", "Indice di qualita' dell'aria e inquinante dominante saranno visualizzati qui quando i dati di monitoraggio saranno disponibili.");
  }

  const airQualityPresentation = getAirQualityPresentation(airQuality);
  const airQualityInsight = getAirQualityInsight(airQuality);
  const displayAirQualityIndex = airQualityIndex ?? getFallbackAirQualityIndex(airQuality) ?? 0;

  return `
    <article class="weather-insight-card weather-insight-card--aqi">
      <div class="weather-insight-card-header">
        <h4 class="weather-insight-card-title">AQI</h4>
      </div>

      <div class="weather-insight-gauge-shell weather-insight-gauge-shell--aqi">
        ${renderSegmentedGauge({
          value: displayAirQualityIndex,
          maxValue: 300,
          ariaLabel: `Indice di qualita' dell'aria ${formatGaugeNumber(displayAirQualityIndex)}`,
          markerColor: airQualityInsight.markerColor,
          segments: [
            { stop: 50, color: "#6ed17a" },
            { stop: 100, color: "#d0c83f" },
            { stop: 150, color: "#efab28" },
            { stop: 200, color: "#dd6c2f" },
            { stop: 300, color: "#5c6487" },
          ],
        })}

        <div class="weather-insight-gauge-center">
          <strong>${formatGaugeNumber(displayAirQualityIndex)}</strong>
        </div>
      </div>

      <div class="weather-insight-copy">
        <p class="weather-insight-status weather-insight-status--${airQualityInsight.tone}">${airQualityPresentation.text}</p>
        <p class="weather-insight-description">${buildAirQualityInsightCopy(displayAirQualityIndex, airQualityPresentation.text, pollutant, pollutantValue, pollutantUnit)}</p>
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
  const trendTemperatures = temperatures.slice(0, TEMPERATURE_TREND_WINDOW_POINTS);
  const referenceValue = toNumericValue(currentTemperature) ?? trendTemperatures[0] ?? 0;
  const endValue = trendTemperatures.at(-1) ?? referenceValue;
  const span = trendTemperatures.length ? Math.max(...trendTemperatures) - Math.min(...trendTemperatures) : 0;
  const risingMoves = trendTemperatures.some((value, index) => index > 0 && value > trendTemperatures[index - 1]);
  const fallingMoves = trendTemperatures.some((value, index) => index > 0 && value < trendTemperatures[index - 1]);

  if (endValue >= referenceValue + 2) {
    return { label: "In rialzo", tone: "rise" };
  }

  if (endValue <= referenceValue - 2) {
    return { label: "In calo", tone: "drop" };
  }

  if (risingMoves && fallingMoves && span >= 2) {
    return { label: "Variabile", tone: "mixed" };
  }

  return { label: "Costante", tone: "steady" };
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

  const maximumPoint = getMaximumTemperaturePoint(points);
  const maximumCopy = maximumPoint?.time_label
    ? ` Massimo previsto di ${formatDetailTemperature(maximumPoint.temperature, unit)} alle ${maximumPoint.time_label}.`
    : "";
  const nightLowPoint = getNighttimeLowPoint(points);
  if (nightLowPoint) {
    return `${lead}${maximumCopy} Durante la notte minimo di ${formatDetailTemperature(nightLowPoint.temperature, unit)} alle ${nightLowPoint.time_label}.`;
  }

  const minimumPoint = getMinimumTemperaturePoint(points);
  if (minimumPoint?.time_label) {
    return `${lead}${maximumCopy} Minimo previsto di ${formatDetailTemperature(minimumPoint.temperature, unit)} alle ${minimumPoint.time_label}.`;
  }

  return `${lead}${maximumCopy}`;
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

function getMaximumTemperaturePoint(points) {
  const validPoints = points.filter((point) => toNumericValue(point?.temperature) !== null);

  if (!validPoints.length) {
    return null;
  }

  return validPoints.reduce((highestPoint, point) =>
    toNumericValue(point.temperature) > toNumericValue(highestPoint.temperature) ? point : highestPoint,
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

function renderWindCompass(windDirection) {
  const direction = getWindDirectionLabel(windDirection);
  const normalizedDirection = windDirection === null ? 0 : ((windDirection % 360) + 360) % 360;
  const flowRotation = (normalizedDirection + 90) % 360;
  const ariaLabel = direction && windDirection !== null
    ? `Vento da ${direction.label} a ${Math.round(windDirection)} gradi`
    : "Direzione del vento non disponibile";

  return `
    <div class="weather-insight-compass" role="img" aria-label="${ariaLabel}">
      <span class="weather-insight-compass-letter weather-insight-compass-letter--north">N</span>
      <span class="weather-insight-compass-letter weather-insight-compass-letter--east">E</span>
      <span class="weather-insight-compass-letter weather-insight-compass-letter--south">S</span>
      <span class="weather-insight-compass-letter weather-insight-compass-letter--west">O</span>
      <span class="weather-insight-compass-ring"></span>
      <span class="weather-insight-compass-arrow" style="transform: translate(-50%, -50%) rotate(${flowRotation}deg);"></span>
      <span class="weather-insight-compass-center"></span>
    </div>
  `;
}

function getWindDirectionLabel(degrees) {
  const numericDegrees = toNumericValue(degrees);

  if (numericDegrees === null) {
    return null;
  }

  const directions = [
    { short: "N", label: "nord" },
    { short: "NE", label: "nord-est" },
    { short: "E", label: "est" },
    { short: "SE", label: "sud-est" },
    { short: "S", label: "sud" },
    { short: "SO", label: "sud-ovest" },
    { short: "O", label: "ovest" },
    { short: "NO", label: "nord-ovest" },
  ];
  const normalizedDegrees = ((numericDegrees % 360) + 360) % 360;
  return directions[Math.round(normalizedDegrees / 45) % directions.length];
}

function getWindInsight(windSpeed, windGust) {
  if (windSpeed < 10 && windGust < 20) {
    return { label: "Calmo", tone: "calm" };
  }

  if (windSpeed < 24 && windGust < 36) {
    return { label: "Brezza leggera", tone: "breeze" };
  }

  if (windSpeed < 40 && windGust < 55) {
    return { label: "Ventilato", tone: "windy" };
  }

  return { label: "Vento sostenuto", tone: "severe" };
}

function buildWindInsightCopy(windSpeed, windGust, direction) {
  const directionText = direction ? `da ${direction.label}` : "con direzione variabile";

  if (windGust - windSpeed >= 15) {
    return `Flusso ${directionText}, media di ${formatSpeed(windSpeed)} e raffiche piu' nette fino a ${formatSpeed(windGust)}.`;
  }

  return `Vento ${directionText}, stabile attorno a ${formatSpeed(windSpeed)} con picchi che raggiungono ${formatSpeed(windGust)}.`;
}

function renderHumidityBars(humidity) {
  const normalizedHumidity = Math.max(0, Math.min(100, humidity));
  const scales = [0.76, 0.88, 1, 0.92, 0.84, 0.94, 0.8];
  const activeBars = normalizedHumidity <= 0 ? 0 : Math.max(1, Math.round((normalizedHumidity / 100) * scales.length));

  return scales
    .map(
      (scale, index) => `
        <span class="weather-insight-humidity-bar${index < activeBars ? " is-active" : ""}" style="--humidity-bar-scale:${scale};"></span>
      `,
    )
    .join("");
}

function getHumidityInsight(humidity) {
  if (humidity < 35) {
    return { label: "Aria secca", tone: "dry" };
  }

  if (humidity <= 65) {
    return { label: "Valori nella norma", tone: "comfortable" };
  }

  if (humidity <= 80) {
    return { label: "Umidita' elevata", tone: "humid" };
  }

  return { label: "Molto umido", tone: "humid" };
}

function buildHumidityInsightCopy(humidity, dewPoint, unit) {
  const dewPointCopy = dewPoint === null ? "" : ` con punto di rugiada a ${formatDetailTemperature(dewPoint, unit)}`;

  if (humidity < 35) {
    return `Umidita' al ${Math.round(humidity)}%${dewPointCopy}. L'aria resta asciutta e favorisce una sensazione piu' leggera.`;
  }

  if (humidity <= 65) {
    return `Umidita' relativa al ${Math.round(humidity)}%${dewPointCopy}. Valori equilibrati per gran parte della giornata.`;
  }

  return `Umidita' relativa al ${Math.round(humidity)}%${dewPointCopy}. L'aria puo' risultare piu' pesante soprattutto nelle ore meno ventilate.`;
}

function getUvInsight(uvIndex) {
  if (uvIndex <= 2) {
    return { label: "Basso", tone: "low", markerColor: "#78cf41" };
  }

  if (uvIndex <= 5) {
    return { label: "Moderato", tone: "moderate", markerColor: "#f4d34b" };
  }

  if (uvIndex <= 7) {
    return { label: "Alto", tone: "high", markerColor: "#ff9d28" };
  }

  if (uvIndex <= 10) {
    return { label: "Molto alto", tone: "very-high", markerColor: "#e14d4a" };
  }

  return { label: "Estremo", tone: "severe", markerColor: "#7c3ec9" };
}

function buildUvInsightCopy(uvIndex, isTomorrowForecast, label) {
  const reference = isTomorrowForecast ? "di domani" : "di oggi";

  if (uvIndex <= 2) {
    return `Il livello massimo di UV ${reference} restera' basso, con esposizione solare generalmente contenuta.`;
  }

  if (uvIndex <= 5) {
    return `Il livello massimo di UV ${reference} sara' moderato. Meglio valutare protezione nelle ore centrali.`;
  }

  if (uvIndex <= 7) {
    return `Il livello massimo di UV ${reference} sara' ${label.toLowerCase()}. Conviene limitare l'esposizione diretta nelle ore centrali.`;
  }

  if (uvIndex <= 10) {
    return `Il livello massimo di UV ${reference} sara' ${label.toLowerCase()}. Consigliata protezione alta e pause frequenti all'ombra.`;
  }

  return `Il livello massimo di UV ${reference} sara' ${label.toLowerCase()}. Meglio ridurre al minimo l'esposizione diretta nelle ore piu' intense.`;
}

function getPollenInsight(pollenIndex, hasPollenData) {
  if (!hasPollenData) {
    return { label: "Non disponibile", tone: "neutral", markerColor: "#d9deed" };
  }

  if (pollenIndex <= 25) {
    return { label: "Basso", tone: "good", markerColor: "#79d948" };
  }

  if (pollenIndex <= 50) {
    return { label: "Moderata", tone: "moderate", markerColor: "#f2cf51" };
  }

  if (pollenIndex <= 75) {
    return { label: "Alta", tone: "poor", markerColor: "#f39e37" };
  }

  return { label: "Molto alta", tone: "very-poor", markerColor: "#e06f3b" };
}

function buildPollenInsightCopy(pollenLevel, primaryAllergy, hasPollenData) {
  if (!hasPollenData) {
    return "Il servizio pollinico non restituisce ancora un valore affidabile per questa localita'.";
  }

  const allergyCopy = primaryAllergy ? ` Allergene principale: ${primaryAllergy}.` : "";
  return `Livello ${pollenLevel?.toLowerCase() || "stimato"} per la giornata corrente.${allergyCopy}`;
}

function getVisibilityInsight(visibility) {
  if (visibility >= 10) {
    return { label: "Eccellente", tone: "excellent" };
  }

  if (visibility >= 7) {
    return { label: "Buona", tone: "good" };
  }

  if (visibility >= 4) {
    return { label: "Ridotta", tone: "moderate" };
  }

  return { label: "Scarsa", tone: "poor" };
}

function buildVisibilityInsightCopy(visibility) {
  if (visibility >= 10) {
    return "Aria limpida e orizzonte ben leggibile per gran parte della giornata.";
  }

  if (visibility >= 7) {
    return `Visibilita' attorno a ${formatWholeInsightNumber(visibility)} km, con condizioni generalmente buone all'aperto.`;
  }

  return `Visibilita' ridotta a circa ${formatWholeInsightNumber(visibility)} km, soprattutto nelle aree piu' umide o trafficate.`;
}

function renderVisibilityBars(visibility) {
  const visibilityRatio = Math.max(0.35, Math.min(1, (visibility || 0) / 10));
  const widths = [0.54, 0.66, 0.78, 0.9, 1];

  return widths
    .map(
      (widthRatio, index) => `
        <span class="weather-insight-visibility-bar" style="--visibility-bar-width:${widthRatio * visibilityRatio}; --visibility-bar-delay:${index};"></span>
      `,
    )
    .join("");
}

function getPressureTrend(currentPressure, pressureTomorrow) {
  const delta = pressureTomorrow === null ? 0 : pressureTomorrow - currentPressure;

  if (delta >= 3) {
    return { label: "In salita", tone: "rise" };
  }

  if (delta > 0) {
    return { label: "Salita lenta", tone: "rise" };
  }

  if (delta <= -3) {
    return { label: "In calo", tone: "drop" };
  }

  if (delta < 0) {
    return { label: "Discesa lenta", tone: "drop" };
  }

  return { label: "Stabile", tone: "steady" };
}

function buildPressureInsightCopy(currentPressure, pressureTomorrow) {
  if (pressureTomorrow === null) {
    return `Pressione attuale di ${formatWholeInsightNumber(currentPressure)} hPa, senza una tendenza affidabile nelle prossime ore.`;
  }

  const delta = pressureTomorrow - currentPressure;
  if (Math.abs(delta) < 1) {
    return `Pressione quasi stabile tra ${formatWholeInsightNumber(currentPressure)} e ${formatWholeInsightNumber(pressureTomorrow)} hPa nel breve termine.`;
  }

  const directionText = delta > 0 ? "aumento" : "calo";
  return `Previsto un ${directionText} graduale di circa ${formatWholeInsightNumber(Math.abs(delta))} hPa entro il prossimo aggiornamento giornaliero.`;
}

function renderPressureTrendGraphic(currentPressure, pressureTomorrow) {
  const values = buildPressureSeries(currentPressure, pressureTomorrow);
  const plotPoints = buildMetricPlotPoints(values, {
    width: 320,
    height: 92,
    padding: { top: 14, right: 18, bottom: 10, left: 8 },
    minRange: 3,
  });
  if (!plotPoints.length) {
    return "";
  }

  const safeHighlightIndex = Math.min(2, plotPoints.length - 1);
  const highlightPoint = plotPoints[safeHighlightIndex] || plotPoints.at(-1);
  const leadingPath = buildSmoothPath(plotPoints.slice(0, safeHighlightIndex + 1));
  const trailingPath = safeHighlightIndex < plotPoints.length - 1 ? buildSmoothPath(plotPoints.slice(safeHighlightIndex)) : "";

  return `
    <svg class="weather-insight-pressure-svg" viewBox="0 0 320 92" role="img" aria-label="Tendenza della pressione atmosferica">
      ${trailingPath ? `<path class="weather-insight-pressure-line weather-insight-pressure-line--tail" d="${trailingPath}" />` : ""}
      <path class="weather-insight-pressure-line" d="${leadingPath}" />
      <circle class="weather-insight-pressure-point" cx="${highlightPoint.x}" cy="${highlightPoint.y}" r="10" />
    </svg>
  `;
}

function buildPressureSeries(currentPressure, pressureTomorrow) {
  const targetPressure = pressureTomorrow ?? currentPressure;
  const delta = targetPressure - currentPressure;

  return [
    currentPressure - delta * 0.28,
    currentPressure - delta * 0.12,
    currentPressure,
    currentPressure + delta * 0.42,
    targetPressure,
  ];
}

function buildMetricPlotPoints(values, { width, height, padding, minRange = 4 }) {
  const numericValues = values.map((value) => toNumericValue(value)).filter((value) => value !== null);

  if (!numericValues.length) {
    return [];
  }

  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const minValue = Math.min(...numericValues);
  const maxValue = Math.max(...numericValues);
  const range = Math.max(maxValue - minValue, minRange);
  const lowerBound = minValue - (range - (maxValue - minValue || 0)) / 2;
  const xStep = numericValues.length > 1 ? plotWidth / (numericValues.length - 1) : 0;

  return numericValues.map((value, index) => ({
    x: padding.left + xStep * index,
    y: height - padding.bottom - ((value - lowerBound) / range) * plotHeight,
  }));
}

function getCurrentTimeLabel() {
  return new Date().toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderMoonPhaseDisc(illumination, phaseLabel) {
  const safeIllumination = illumination === null ? 50 : Math.max(0, Math.min(100, illumination));
  const radius = 46;
  const center = 56;
  const shadowOffset = (safeIllumination / 100) * radius * 2;
  const shadowCenterX = isWaxingMoonPhase(phaseLabel) ? center - shadowOffset : center + shadowOffset;
  const clipId = `moon-phase-disc-${safeIllumination}-${(phaseLabel || "nd").replace(/\s+/g, "-").toLowerCase()}`;

  return `
    <svg class="weather-insight-moon-phase-svg" viewBox="0 0 112 112" role="img" aria-label="Fase lunare al ${formatWholeInsightNumber(safeIllumination)}%">
      <defs>
        <clipPath id="${clipId}">
          <circle cx="${center}" cy="${center}" r="${radius}" />
        </clipPath>
      </defs>
      <circle class="weather-insight-moon-phase-base" cx="${center}" cy="${center}" r="${radius}" />
      ${safeIllumination >= 100 ? "" : `<circle class="weather-insight-moon-phase-shadow" cx="${shadowCenterX}" cy="${center}" r="${radius}" clip-path="url(#${clipId})" />`}
      <circle class="weather-insight-moon-phase-outline" cx="${center}" cy="${center}" r="${radius}" />
    </svg>
  `;
}

function isWaxingMoonPhase(phaseLabel) {
  if (!phaseLabel) {
    return true;
  }

  return phaseLabel.includes("crescente") || phaseLabel === "Primo quarto" || phaseLabel === "Luna nuova";
}

function formatShortItalianDate(dateValue) {
  if (!dateValue) {
    return "n.d.";
  }

  const [year, month, day] = String(dateValue).split("-").map(Number);
  const parsedDate = new Date(year, (month || 1) - 1, day || 1);

  if (Number.isNaN(parsedDate.getTime())) {
    return "n.d.";
  }

  return parsedDate.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
  }).replace(/\./g, "");
}

function getSkyTrackGeometry() {
  const arcStartPoint = { x: 56, y: 68 };
  const arcControlPoint = { x: 92, y: 14 };
  const arcEndPoint = { x: 134, y: 68 };
  const leftTrackStart = { x: 24, y: 108 };
  const rightTrackEnd = { x: 160, y: 108 };
  const leftTrackControl = { x: 36, y: 92 };
  const rightTrackControl = { x: 148, y: 92 };

  return {
    arcStartPoint,
    arcControlPoint,
    arcEndPoint,
    leftTrackStart,
    rightTrackEnd,
    leftTrackControl,
    rightTrackControl,
    fullArcPath: `M ${arcStartPoint.x} ${arcStartPoint.y} Q ${arcControlPoint.x} ${arcControlPoint.y} ${arcEndPoint.x} ${arcEndPoint.y}`,
  };
}

function renderSunGraphic(progress) {
  const geometry = getSkyTrackGeometry();
  const skyGraphicState = getSkyGraphicState(progress);
  const sunPoint = getSkyGraphicPoint(skyGraphicState.segment, skyGraphicState.segmentProgress, geometry);
  const completedArcPath = skyGraphicState.isOutsideWindow
    ? geometry.fullArcPath
    : getQuadraticSegmentPath(geometry.arcStartPoint, geometry.arcControlPoint, geometry.arcEndPoint, 0, skyGraphicState.segmentProgress);
  const remainingArcPath = skyGraphicState.isOutsideWindow
    ? ""
    : getQuadraticSegmentPath(geometry.arcStartPoint, geometry.arcControlPoint, geometry.arcEndPoint, skyGraphicState.segmentProgress, 1);
  const sunBodyClass = skyGraphicState.isOutsideWindow
    ? "weather-insight-sun-body weather-insight-sun-body--inactive"
    : "weather-insight-sun-body";
  const sunCoreClass = skyGraphicState.isOutsideWindow
    ? "weather-insight-sun-core weather-insight-sun-core--inactive"
    : "weather-insight-sun-core";
  const sunSpotMarkup = skyGraphicState.isOutsideWindow
    ? `
        <circle class="weather-insight-sun-spot" cx="-3.5" cy="-2.2" r="1.4" />
        <circle class="weather-insight-sun-spot" cx="2.8" cy="-4.2" r="1.2" />
        <circle class="weather-insight-sun-spot" cx="4.1" cy="1.8" r="1.5" />
        <circle class="weather-insight-sun-spot" cx="-1.4" cy="4.4" r="1.3" />
      `
    : "";

  return `
    <svg class="weather-insight-sun-svg" viewBox="0 0 184 122" role="img" aria-label="Percorso del sole nel cielo">
      <defs>
        <linearGradient id="weather-insight-sun-arc-gradient" x1="56" y1="68" x2="134" y2="68" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#e35f5d" />
          <stop offset="52%" stop-color="#db4a52" />
          <stop offset="100%" stop-color="#8537bd" />
        </linearGradient>
      </defs>

      <path class="weather-insight-sun-shadow-path" d="M ${geometry.leftTrackStart.x} ${geometry.leftTrackStart.y} Q ${geometry.leftTrackControl.x} ${geometry.leftTrackControl.y} ${geometry.arcStartPoint.x} ${geometry.arcStartPoint.y}" />
      ${remainingArcPath ? `<path class="weather-insight-sun-shadow-path" d="${remainingArcPath}" />` : ""}
      <path class="weather-insight-sun-shadow-path" d="M ${geometry.arcEndPoint.x} ${geometry.arcEndPoint.y} Q ${geometry.rightTrackControl.x} ${geometry.rightTrackControl.y} ${geometry.rightTrackEnd.x} ${geometry.rightTrackEnd.y}" />
      <line class="weather-insight-sun-horizon" x1="24" y1="68" x2="160" y2="68" />
      <circle class="weather-insight-sun-horizon-point" cx="${geometry.arcStartPoint.x}" cy="${geometry.arcStartPoint.y}" r="6.5" />
      <circle class="weather-insight-sun-horizon-point" cx="${geometry.arcEndPoint.x}" cy="${geometry.arcEndPoint.y}" r="6.5" />
      <path class="weather-insight-sun-arc" d="${completedArcPath}" stroke="url(#weather-insight-sun-arc-gradient)" />
      <g transform="translate(${sunPoint.x} ${sunPoint.y})">
        <circle class="weather-insight-sun-backdrop" r="14" />
        <circle class="${sunBodyClass}" r="10.8" />
        <circle class="${sunCoreClass}" r="7.6" />
        ${sunSpotMarkup}
      </g>
    </svg>
  `;
}

function renderMoonGraphic(progress) {
  const geometry = getSkyTrackGeometry();
  const moonGraphicState = getSkyGraphicState(progress);
  const moonPoint = getSkyGraphicPoint(moonGraphicState.segment, moonGraphicState.segmentProgress, geometry);
  const completedArcPath = moonGraphicState.isOutsideWindow
    ? geometry.fullArcPath
    : getQuadraticSegmentPath(geometry.arcStartPoint, geometry.arcControlPoint, geometry.arcEndPoint, 0, moonGraphicState.segmentProgress);
  const remainingArcPath = moonGraphicState.isOutsideWindow
    ? ""
    : getQuadraticSegmentPath(geometry.arcStartPoint, geometry.arcControlPoint, geometry.arcEndPoint, moonGraphicState.segmentProgress, 1);
  const moonBackdropClass = moonGraphicState.isOutsideWindow
    ? "weather-insight-moon-backdrop weather-insight-moon-backdrop--inactive"
    : "weather-insight-moon-backdrop";
  const moonBodyClass = moonGraphicState.isOutsideWindow
    ? "weather-insight-moon-body weather-insight-moon-body--inactive"
    : "weather-insight-moon-body";
  const moonCutClass = moonGraphicState.isOutsideWindow
    ? "weather-insight-moon-cut weather-insight-moon-cut--inactive"
    : "weather-insight-moon-cut";

  return `
    <svg class="weather-insight-moon-svg" viewBox="0 0 184 122" role="img" aria-label="Percorso della luna nel cielo">
      <path class="weather-insight-moon-shadow-path" d="M ${geometry.leftTrackStart.x} ${geometry.leftTrackStart.y} Q ${geometry.leftTrackControl.x} ${geometry.leftTrackControl.y} ${geometry.arcStartPoint.x} ${geometry.arcStartPoint.y}" />
      ${remainingArcPath ? `<path class="weather-insight-moon-shadow-path" d="${remainingArcPath}" />` : ""}
      <path class="weather-insight-moon-shadow-path" d="M ${geometry.arcEndPoint.x} ${geometry.arcEndPoint.y} Q ${geometry.rightTrackControl.x} ${geometry.rightTrackControl.y} ${geometry.rightTrackEnd.x} ${geometry.rightTrackEnd.y}" />
      <line class="weather-insight-moon-horizon" x1="24" y1="68" x2="160" y2="68" />
      <circle class="weather-insight-moon-horizon-point" cx="${geometry.arcStartPoint.x}" cy="${geometry.arcStartPoint.y}" r="6.5" />
      <circle class="weather-insight-moon-horizon-point" cx="${geometry.arcEndPoint.x}" cy="${geometry.arcEndPoint.y}" r="6.5" />
      <path class="weather-insight-moon-arc" d="${completedArcPath}" />
      <g transform="translate(${moonPoint.x} ${moonPoint.y})">
        <circle class="${moonBackdropClass}" r="14" />
        <circle class="${moonBodyClass}" r="10.8" />
        <circle class="${moonCutClass}" cx="4.8" cy="-3.8" r="7.6" />
      </g>
    </svg>
  `;
}

function getSkyGraphicState(progress) {
  if (progress === null) {
    return { segment: "in-window", segmentProgress: 0.54, isOutsideWindow: false };
  }

  if (progress < 0) {
    return {
      segment: "before-rise",
      segmentProgress: clampSkyTrackProgress(1 + progress),
      isOutsideWindow: true,
    };
  }

  if (progress > 1) {
    return {
      segment: "after-set",
      segmentProgress: clampSkyTrackProgress(progress - 1),
      isOutsideWindow: true,
    };
  }

  return {
    segment: "in-window",
    segmentProgress: Math.max(0, Math.min(1, progress)),
    isOutsideWindow: false,
  };
}

function clampSkyTrackProgress(progress) {
  return Math.max(0.16, Math.min(0.92, progress));
}

function getSkyGraphicPoint(segment, segmentProgress, points) {
  if (segment === "before-rise") {
    return getQuadraticPoint(points.leftTrackStart, points.leftTrackControl, points.arcStartPoint, segmentProgress);
  }

  if (segment === "after-set") {
    return getQuadraticPoint(points.arcEndPoint, points.rightTrackControl, points.rightTrackEnd, segmentProgress);
  }

  return getQuadraticPoint(points.arcStartPoint, points.arcControlPoint, points.arcEndPoint, segmentProgress);
}

function getQuadraticPoint(startPoint, controlPoint, endPoint, progress) {
  const inverse = 1 - progress;

  return {
    x: inverse * inverse * startPoint.x + 2 * inverse * progress * controlPoint.x + progress * progress * endPoint.x,
    y: inverse * inverse * startPoint.y + 2 * inverse * progress * controlPoint.y + progress * progress * endPoint.y,
  };
}

function getQuadraticSegmentPath(startPoint, controlPoint, endPoint, startProgress, endProgress) {
  if (endProgress <= startProgress) {
    const point = getQuadraticPoint(startPoint, controlPoint, endPoint, startProgress);
    return `M ${point.x} ${point.y}`;
  }

  if (startProgress <= 0 && endProgress >= 1) {
    return `M ${startPoint.x} ${startPoint.y} Q ${controlPoint.x} ${controlPoint.y} ${endPoint.x} ${endPoint.y}`;
  }

  const [leftSegment] = splitQuadraticCurve(startPoint, controlPoint, endPoint, endProgress);
  const normalizedStart = endProgress === 0 ? 0 : startProgress / endProgress;
  const [, targetSegment] = splitQuadraticCurve(
    leftSegment.start,
    leftSegment.control,
    leftSegment.end,
    normalizedStart,
  );

  return `M ${targetSegment.start.x} ${targetSegment.start.y} Q ${targetSegment.control.x} ${targetSegment.control.y} ${targetSegment.end.x} ${targetSegment.end.y}`;
}

function splitQuadraticCurve(startPoint, controlPoint, endPoint, progress) {
  const point01 = interpolatePoint(startPoint, controlPoint, progress);
  const point12 = interpolatePoint(controlPoint, endPoint, progress);
  const splitPoint = interpolatePoint(point01, point12, progress);

  return [
    { start: startPoint, control: point01, end: splitPoint },
    { start: splitPoint, control: point12, end: endPoint },
  ];
}

function interpolatePoint(startPoint, endPoint, progress) {
  return {
    x: startPoint.x + (endPoint.x - startPoint.x) * progress,
    y: startPoint.y + (endPoint.y - startPoint.y) * progress,
  };
}

function formatDurationMinutes(minutes) {
  const numericMinutes = toNumericValue(minutes);

  if (numericMinutes === null) {
    return "Durata non disponibile";
  }

  const hours = Math.floor(numericMinutes / 60);
  const remainingMinutes = Math.round(numericMinutes % 60);

  return `${hours} ore ${remainingMinutes} minuti`;
}

function buildMoonInsightCopy(moonriseTime, moonsetTime, moonVisibilityMinutes, moonPhaseLabel) {
  const durationCopy = moonVisibilityMinutes === null ? "durata non disponibile" : formatDurationMinutes(moonVisibilityMinutes).toLowerCase();

  if (!moonriseTime || !moonsetTime) {
    return `${moonPhaseLabel}. I prossimi orari lunari non sono ancora disponibili per questa localita'.`;
  }

  return `${moonPhaseLabel}, sopra l'orizzonte per ${durationCopy}, con alba lunare alle ${moonriseTime} e tramonto alle ${moonsetTime}.`;
}

function getAirQualityInsight(airQuality) {
  switch (airQuality) {
    case "Buona":
      return { tone: "excellent", markerColor: "#4fd672" };
    case "Accettabile":
      return { tone: "good", markerColor: "#8fd652" };
    case "Moderata":
      return { tone: "moderate", markerColor: "#efb834" };
    case "Cattiva":
      return { tone: "poor", markerColor: "#df762c" };
    case "Molto cattiva":
      return { tone: "very-poor", markerColor: "#c9532f" };
    default:
      return { tone: "neutral", markerColor: "#9fd2ff" };
  }
}

function getFallbackAirQualityIndex(airQuality) {
  return {
    Buona: 25,
    Accettabile: 75,
    Moderata: 125,
    Cattiva: 175,
    "Molto cattiva": 250,
  }[airQuality] ?? null;
}

function buildAirQualityInsightCopy(airQualityIndex, label, pollutant, pollutantValue, pollutantUnit) {
  const pollutantCopy = pollutant && pollutantValue !== null
    ? ` Inquinante primario: ${pollutant} ${formatGaugeNumber(pollutantValue)} ${pollutantUnit}.`
    : "";
  const guidance = airQualityIndex >= 151
    ? " Meglio ridurre le attivita' intense all'aperto."
    : airQualityIndex >= 101
      ? " Le persone sensibili dovrebbero monitorare l'esposizione prolungata."
      : " Le condizioni restano generalmente favorevoli per le attivita' esterne.";

  return `Indice stimato ${Math.round(airQualityIndex)} (${label.toLowerCase()}).${pollutantCopy}${guidance}`;
}

function renderSegmentedGauge({ value, maxValue, segments, markerColor, ariaLabel }) {
  const clampedValue = Math.max(0, Math.min(maxValue, value));
  const radius = 46;
  const centerX = 74;
  const centerY = 74;
  const trackPath = describeArc(centerX, centerY, radius, GAUGE_START_ANGLE, GAUGE_END_ANGLE);
  const markerAngle = GAUGE_START_ANGLE + (clampedValue / maxValue) * GAUGE_SWEEP_ANGLE;
  const markerPoint = polarToCartesian(centerX, centerY, radius, markerAngle);
  let previousStop = 0;

  const segmentMarkup = segments
    .map((segment, index) => {
      const segmentStart = previousStop;
      previousStop = segment.stop;

      const startAngle = GAUGE_START_ANGLE + (segmentStart / maxValue) * GAUGE_SWEEP_ANGLE + (index === 0 ? 0 : 3);
      const endAngle = GAUGE_START_ANGLE + (segment.stop / maxValue) * GAUGE_SWEEP_ANGLE - (segment.stop >= maxValue ? 0 : 3);

      if (endAngle <= startAngle) {
        return "";
      }

      return `<path class="weather-insight-gauge-segment" stroke="${segment.color}" d="${describeArc(centerX, centerY, radius, startAngle, endAngle)}" />`;
    })
    .join("");

  return `
    <svg class="weather-insight-gauge" viewBox="0 0 148 148" role="img" aria-label="${ariaLabel}">
      <path class="weather-insight-gauge-track" d="${trackPath}" />
      ${segmentMarkup}
      <circle class="weather-insight-gauge-marker" cx="${markerPoint.x}" cy="${markerPoint.y}" r="8.5" style="fill:${markerColor};" />
    </svg>
  `;
}

function describeArc(centerX, centerY, radius, startAngle, endAngle) {
  const start = polarToCartesian(centerX, centerY, radius, endAngle);
  const end = polarToCartesian(centerX, centerY, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function formatWholeInsightNumber(value) {
  const numericValue = toNumericValue(value);

  if (numericValue === null) {
    return "--";
  }

  return Math.round(numericValue).toLocaleString("it-IT");
}

function formatGaugeNumber(value) {
  const numericValue = toNumericValue(value);

  if (numericValue === null) {
    return "--";
  }

  return numericValue.toLocaleString("it-IT", {
    minimumFractionDigits: Number.isInteger(numericValue) ? 0 : 1,
    maximumFractionDigits: 1,
  });
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