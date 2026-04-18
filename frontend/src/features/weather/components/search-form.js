export function renderSearchForm() {
  return `
    <header class="search-header">
      <div class="header-content">
        <h1 class="search-header-title">Previsioni</h1>

        <div class="header-actions">
          <button id="refresh-dashboard" class="header-action-btn header-action-btn--refresh" type="button" title="Aggiorna dashboard" aria-label="Aggiorna dashboard">↻</button>
          <button id="theme-toggle" class="header-action-btn theme-toggle" type="button" title="Cambia tema" aria-label="Cambia tema">☾</button>

          <form id="search-form" class="search-form">
            <input type="text" id="city-input" placeholder="Cerca localita'" autocomplete="off" />
            <button class="search-submit" type="submit" title="Cerca" aria-label="Cerca">⌕</button>
            <div id="suggestions" class="suggestions-list"></div>
          </form>
        </div>
      </div>
    </header>
    <div class="cities-history">
      <div class="history-wrapper">
        <div id="history-container" class="history-container"></div>
        <div class="history-nav">
          <button id="history-prev" class="history-nav-btn history-nav-prev" type="button" title="Scorri indietro">&larr;</button>
          <button id="history-next" class="history-nav-btn history-nav-next" type="button" title="Scorri avanti">&rarr;</button>
        </div>
        <button id="temperature-unit-toggle" class="history-unit-toggle" type="button" title="Apri impostazioni temperatura" aria-label="Apri impostazioni temperatura" aria-expanded="false">C</button>
        <div id="temperature-settings-dropdown" class="temperature-settings-dropdown" aria-hidden="true">
          <div class="temperature-settings-header">
            <h3 class="temperature-settings-title">IMPOSTAZIONI METEO</h3>
            <button id="temperature-settings-close" class="temperature-settings-close" type="button" aria-label="Chiudi impostazioni meteo">×</button>
          </div>

          <div class="temperature-settings-group">
            <span class="temperature-settings-label">Temperatura</span>

            <div class="temperature-settings-options" role="group" aria-label="Seleziona unita' di temperatura">
              <button id="temperature-option-fahrenheit" class="temperature-settings-option" type="button" data-unit="fahrenheit">Fahrenheit (°F)</button>
              <button id="temperature-option-celsius" class="temperature-settings-option" type="button" data-unit="celsius">Celsius (°C)</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
