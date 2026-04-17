export function renderSearchForm() {
  return `
    <header class="search-header">
      <div class="header-content">
        <form id="search-form" class="search-form">
          <input type="text" id="city-input" placeholder="Cerca una citta..." autocomplete="off" />
          <button type="submit">Cerca</button>
        </form>
        <button id="theme-toggle" class="theme-toggle" type="button" title="Cambia tema">Light</button>
      </div>
      <div id="suggestions" class="suggestions-list"></div>
    </header>
    <div class="cities-history">
      <div class="history-wrapper">
        <div id="history-container" class="history-container"></div>
        <div class="history-nav">
          <button id="history-prev" class="history-nav-btn history-nav-prev" type="button" title="Scorri indietro">&larr;</button>
          <button id="history-next" class="history-nav-btn history-nav-next" type="button" title="Scorri avanti">&rarr;</button>
        </div>
        <button id="temperature-unit-toggle" class="history-unit-toggle" type="button" title="Passa tra Celsius e Fahrenheit">C</button>
      </div>
    </div>
    <p id="current-location" class="current-location">--</p>
  `;
}
