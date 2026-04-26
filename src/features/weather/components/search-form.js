import { renderAppHeader } from "../../../shared/components/app-shell.js";

export function renderSearchForm() {
  const headerActions = `
    <button id="refresh-dashboard" class="header-action-btn header-action-btn--refresh" type="button" title="Aggiorna dashboard" aria-label="Aggiorna dashboard" aria-busy="false">
      <span class="refresh-dashboard-icon" aria-hidden="true">&#8635;</span>
    </button>
    <button id="theme-toggle" class="header-action-btn theme-toggle" type="button" title="Cambia tema" aria-label="Cambia tema">&#9790;</button>

    <form id="search-form" class="search-form search-form--forecast">
      <input type="text" id="city-input" placeholder="Cerca localita'" autocomplete="off" />
      <button class="search-submit" type="submit" title="Cerca" aria-label="Cerca">&#8981;</button>
      <div id="suggestions" class="suggestions-list"></div>
    </form>
  `;

  return `
    ${renderAppHeader({ title: "Previsioni", activePage: "forecast", actions: headerActions })}
  `;
}

export function renderWeatherControls() {
  return `
    <div id="refresh-toast" class="refresh-toast" role="status" aria-live="polite" aria-atomic="true"></div>
    <div class="cities-history">
      <div class="history-wrapper">
        <div id="history-container-shell" class="history-container-shell">
          <div id="history-container" class="history-container"></div>
          <div id="history-dropdown-layer" class="history-dropdown" aria-hidden="true">
            <button id="history-remove-button" type="button" class="history-remove">Rimuovi dai preferiti</button>
          </div>
        </div>
        <div class="history-nav">
          <button id="history-prev" class="history-nav-btn history-nav-prev" type="button" title="Scorri indietro">&larr;</button>
          <button id="history-next" class="history-nav-btn history-nav-next" type="button" title="Scorri avanti">&rarr;</button>
        </div>
        <button id="temperature-unit-toggle" class="history-unit-toggle" type="button" title="Apri impostazioni temperatura" aria-label="Apri impostazioni temperatura" aria-expanded="false">C</button>
        <div id="temperature-settings-dropdown" class="temperature-settings-dropdown" aria-hidden="true">
          <div class="temperature-settings-header">
            <h3 class="temperature-settings-title">IMPOSTAZIONI METEO</h3>
            <button id="temperature-settings-close" class="temperature-settings-close" type="button" aria-label="Chiudi impostazioni meteo">&times;</button>
          </div>

          <div class="temperature-settings-group">
            <span class="temperature-settings-label">Temperatura</span>

            <div class="temperature-settings-options" role="group" aria-label="Seleziona unita' di temperatura">
              <button id="temperature-option-fahrenheit" class="temperature-settings-option" type="button" data-unit="fahrenheit">Fahrenheit (&deg;F)</button>
              <button id="temperature-option-celsius" class="temperature-settings-option" type="button" data-unit="celsius">Celsius (&deg;C)</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
