const AIR_QUALITY_MAP = {
  Buona: { className: "air-quality-dot--excellent", text: "Ottima" },
  Accettabile: { className: "air-quality-dot--good", text: "Buona" },
  Moderata: { className: "air-quality-dot--moderate", text: "Moderata" },
  Cattiva: { className: "air-quality-dot--poor", text: "Scarsa" },
  "Molto cattiva": { className: "air-quality-dot--very-poor", text: "Molto scarsa" },
  "N/A": { className: "air-quality-dot--na", text: "Non disponibile" },
};

export function getTemperatureUnitCharacter(unit = "celsius") {
  return unit === "fahrenheit" ? "F" : "C";
}

export function shouldShowTemperatureDegree(unit = "celsius") {
  return unit === "celsius";
}

function getTemperatureUnitText(unit = "celsius") {
  const unitCharacter = getTemperatureUnitCharacter(unit);

  return shouldShowTemperatureDegree(unit) ? `°${unitCharacter}` : unitCharacter;
}

function getDetailTemperatureUnitText(unit = "celsius") {
  return shouldShowTemperatureDegree(unit) ? "°" : getTemperatureUnitCharacter(unit);
}

function getRoundedTemperatureValue(value, unit = "celsius") {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) {
    return null;
  }

  if (unit === "fahrenheit") {
    return Math.round((numericValue * 9) / 5 + 32);
  }

  return Math.round(numericValue);
}

function getTemperaturePresentation(value, unit = "celsius") {
  const roundedValue = getRoundedTemperatureValue(value, unit);
  const showDegree = shouldShowTemperatureDegree(unit);
  const unitCharacter = getTemperatureUnitCharacter(unit);

  return {
    roundedValue,
    textLabel: roundedValue === null ? formatTemperaturePlaceholder(unit) : `${roundedValue}${getTemperatureUnitText(unit)}`,
    showDegree,
    unitCharacter,
    valueCharacter: roundedValue === null ? "--" : String(roundedValue),
  };
}

export function formatTemperaturePlaceholder(unit = "celsius") {
  return `--${getTemperatureUnitText(unit)}`;
}

export function formatDetailTemperaturePlaceholder(unit = "celsius") {
  return `--${getDetailTemperatureUnitText(unit)}`;
}

export function renderPrimaryTemperature(value, unit = "celsius") {
  const presentation = getTemperaturePresentation(value, unit);

  return `
    <span class="temperature-value">${presentation.valueCharacter}</span>
    <span class="temperature-unit-group" aria-hidden="true">
      ${presentation.showDegree ? '<sup class="temperature-degree">°</sup>' : ""}
      <span class="temperature-unit">${presentation.unitCharacter}</span>
    </span>
  `;
}

export function renderInlineTemperature(value, unit = "celsius") {
  const presentation = getTemperaturePresentation(value, unit);

  return `<span class="temperature-inline" aria-hidden="true"><span class="temperature-inline__value">${presentation.valueCharacter}</span>${presentation.showDegree ? '<sup class="temperature-inline__degree">°</sup>' : ""}<span class="temperature-inline__unit">${presentation.unitCharacter}</span></span>`;
}

export function renderDetailInlineTemperature(value, unit = "celsius") {
  const roundedValue = getRoundedTemperatureValue(value, unit);
  const showDegree = shouldShowTemperatureDegree(unit);
  const valueCharacter = roundedValue === null ? "--" : String(roundedValue);
  const unitCharacter = showDegree ? "" : getTemperatureUnitCharacter(unit);

  return `<span class="temperature-inline" aria-hidden="true"><span class="temperature-inline__value">${valueCharacter}</span>${showDegree ? '<sup class="temperature-inline__degree">°</sup>' : ""}${unitCharacter ? `<span class="temperature-inline__unit">${unitCharacter}</span>` : ""}</span>`;
}

export function formatTemperature(value, unit = "celsius") {
  return getTemperaturePresentation(value, unit).textLabel;
}

export function formatDetailTemperature(value, unit = "celsius") {
  const roundedValue = getRoundedTemperatureValue(value, unit);

  if (roundedValue === null) {
    return formatDetailTemperaturePlaceholder(unit);
  }

  return `${roundedValue}${getDetailTemperatureUnitText(unit)}`;
}

export function formatLocation(data) {
  const isItaly = data.country === "IT" || data.country_name === "Italy";
  const parts = isItaly
    ? [data.name, data.state]
    : [data.name, data.state, data.country_name || data.country];

  return parts.filter(Boolean).join(", ") || "--";
}

export function getAirQualityPresentation(value) {
  return AIR_QUALITY_MAP[value] || AIR_QUALITY_MAP["N/A"];
}

export function getWeatherIconUrl(icon, variant = "2x") {
  if (!icon) {
    return "";
  }

  const suffix = variant ? `@${variant}` : "";
  return `https://openweathermap.org/img/wn/${icon}${suffix}.png`;
}
