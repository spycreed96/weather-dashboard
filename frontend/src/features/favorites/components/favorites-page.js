function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatRounded(value, fallback = "--") {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.round(number)) : fallback;
}

export function renderFavoritesPage({ favoritesCount = 0 } = {}) {
  const countLabel = favoritesCount === 1 ? "1 preferita" : `${favoritesCount} preferite`;

  return `
    <section class="favorites-view" aria-labelledby="favorites-main-title">
      <div class="favorites-overview-hero">
        <div class="favorites-overview-copy">
          <p class="favorites-route-eyebrow">Panoramica</p>
          <h2 id="favorites-main-title" class="favorites-section-title">Localita principale</h2>
          <p class="favorites-route-description">
            Qui trovi la localita principale attuale e la raccolta delle localita salvate tra i preferiti.
          </p>
        </div>

        <div class="favorites-overview-meta">
          <span id="favorites-count" class="favorites-overview-badge">${escapeHtml(countLabel)}</span>
        </div>
      </div>

      <p id="favorites-sync-status" class="favorites-sync-status" role="status" aria-live="polite"></p>

      <div id="favorites-primary-location" class="favorites-primary-location"></div>

      <div class="favorites-section-heading">
        <div>
          <h2 class="favorites-section-title favorites-section-title--secondary">Localita preferite</h2>
          <p class="favorites-section-subtitle">Aggiungi nuove localita dalla view dedicata con ricerca e suggerimenti.</p>
        </div>

        <button id="favorites-open-add-route" class="favorites-section-action" type="button">
          Aggiungi localita
        </button>
      </div>

      <div id="favorites-grid" class="favorites-grid"></div>
      <div id="favorites-context-menu" class="favorites-context-menu" aria-hidden="true">
        <button id="favorites-remove-button" class="favorites-context-menu__action" type="button">
          Rimuovi dai preferiti
        </button>
      </div>
      <p id="favorites-feedback" class="favorites-feedback" role="status" aria-live="polite"></p>
    </section>
  `;
}

export function renderFavoritesAddPage() {
  return `
    <section class="favorites-view favorites-view--add" aria-labelledby="favorites-add-title">
      <div class="favorites-route-header">
        <button id="favorites-route-back" class="favorites-route-back" type="button" aria-label="Torna ai preferiti">
          &larr;
        </button>

        <div class="favorites-route-copy">
          <p class="favorites-route-eyebrow">Aggiungi</p>
          <h2 id="favorites-add-title" class="favorites-section-title">Nuova localita preferita</h2>
          <p class="favorites-route-description">
            Cerca una citta con la search bar, controlla l&apos;anteprima meteo e conferma l&apos;aggiunta ai preferiti.
          </p>
        </div>
      </div>

      <div class="favorites-add-layout">
        <div class="favorites-add-stage">
          <div id="favorites-search-shell" class="favorites-search-shell">
            <form id="favorites-search-form" class="search-form favorites-search-form">
              <input
                id="favorites-city-input"
                type="text"
                placeholder="Cerca localita"
                autocomplete="off"
              />
              <button class="search-submit" type="submit" title="Cerca" aria-label="Cerca">&#8981;</button>
              <div id="favorites-suggestions" class="suggestions-list"></div>
            </form>
          </div>

          <p class="favorites-add-hint">
            Seleziona un suggerimento oppure premi Cerca per preparare l&apos;anteprima della localita.
          </p>
          <p id="favorites-add-feedback" class="favorites-feedback favorites-feedback--add" role="status" aria-live="polite"></p>
        </div>

        <div id="favorites-add-preview" class="favorites-add-preview"></div>
      </div>
    </section>
  `;
}

export function renderFavoriteCard(location, { primary = false, contextMenu = false } = {}) {
  const className = [
    "favorite-card",
    primary ? "favorite-card--primary" : "",
    contextMenu ? "favorite-card--contextual" : "",
  ].filter(Boolean).join(" ");
  const queryAttribute = contextMenu && location?.query
    ? ` data-favorite-query="${escapeHtml(location.query)}" data-favorite-name="${escapeHtml(location.name)}"`
    : "";

  return `
    <article class="${className}"${queryAttribute}>
      <h3 class="favorite-card__title">${escapeHtml(location.name)}</h3>
      <div class="favorite-card__content">
        <p class="favorite-card__temperature">
          <span>${formatRounded(location.temperature)}</span>
          <small>&deg;C</small>
        </p>
        <div class="favorite-card__range">
          <span>${formatRounded(location.maxTemperature)}&deg;</span>
          <span>${formatRounded(location.minTemperature)}&deg;</span>
        </div>
        <div class="favorite-card__metrics">
          <span><i class="favorite-card__icon favorite-card__icon--wind" aria-hidden="true"></i>${formatRounded(location.windSpeed)} km/h</span>
          <span><i class="favorite-card__icon favorite-card__icon--drop" aria-hidden="true"></i>${formatRounded(location.precipitationProbability, "0")}%</span>
        </div>
      </div>
      <p class="favorite-card__description">${escapeHtml(location.description)}</p>
    </article>
  `;
}

export function renderFavoritesEmptyState() {
  return `
    <article class="favorites-empty-state">
      <p class="favorites-empty-state__eyebrow">Ancora vuota</p>
      <h3 class="favorites-empty-state__title">Nessuna localita preferita salvata</h3>
      <p class="favorites-empty-state__copy">
        Apri la view di aggiunta per cercare una citta e iniziare a costruire la tua lista di preferiti.
      </p>
    </article>
  `;
}

export function renderFavoritesAddPreview({ candidate = null, pending = false } = {}) {
  if (!candidate && pending) {
    return `
      <section class="favorites-add-preview-panel favorites-add-preview-panel--loading" aria-live="polite">
        <p class="favorites-add-preview-label">Anteprima in caricamento</p>
        <h3 class="favorites-add-preview-title">Sto recuperando i dati della localita</h3>
        <p class="favorites-add-preview-copy">
          Attendi un momento: preparo la card meteo che potrai aggiungere ai preferiti.
        </p>
      </section>
    `;
  }

  if (!candidate) {
    return `
      <section class="favorites-add-preview-panel">
        <p class="favorites-add-preview-label">Anteprima</p>
        <h3 class="favorites-add-preview-title">Nessuna localita selezionata</h3>
        <p class="favorites-add-preview-copy">
          Cerca una citta per vedere qui l&apos;anteprima e confermare l&apos;aggiunta ai preferiti.
        </p>
      </section>
    `;
  }

  return `
    <section class="favorites-add-preview-panel favorites-add-preview-panel--candidate">
      <p class="favorites-add-preview-label">Anteprima pronta</p>
      <div class="favorites-add-preview-card">
        ${renderFavoriteCard(candidate)}
      </div>

      <div class="favorites-add-preview-footer">
        <p class="favorites-add-preview-copy">
          La localita principale non cambiera: questa azione aggiunge solo una nuova card ai preferiti.
        </p>

        <div class="favorites-add-preview-actions">
          <button id="favorites-add-confirm" class="favorites-add-confirm" type="button" ${pending ? "disabled" : ""}>
            ${pending ? "Aggiungo..." : "Aggiungi ai preferiti"}
          </button>
          <button id="favorites-add-reset" class="favorites-add-reset" type="button" ${pending ? "disabled" : ""}>
            Nuova ricerca
          </button>
        </div>
      </div>
    </section>
  `;
}
