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

export function renderFavoritesPage() {
  return `
    <section class="favorites-view" aria-labelledby="favorites-main-title">
      <h2 id="favorites-main-title" class="favorites-section-title">Localit&agrave; principale</h2>
      <div id="favorites-primary-location" class="favorites-primary-location"></div>

      <h2 class="favorites-section-title">Localit&agrave; preferite</h2>
      <div id="favorites-grid" class="favorites-grid"></div>
      <p id="favorites-feedback" class="favorites-feedback" role="status" aria-live="polite"></p>
    </section>
  `;
}

export function renderFavoriteCard(location, { primary = false } = {}) {
  const className = primary ? "favorite-card favorite-card--primary" : "favorite-card";

  return `
    <article class="${className}">
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

export function renderAddFavoriteTile({ isAdding = false, query = "", pending = false } = {}) {
  if (!isAdding) {
    return `
      <button id="favorites-add-open" class="favorites-add-tile" type="button" aria-label="Aggiungi localita preferita">
        <span aria-hidden="true">+</span>
      </button>
    `;
  }

  return `
    <form id="favorites-add-form" class="favorites-add-form">
      <input id="favorites-add-input" class="favorites-add-input" type="text" value="${escapeHtml(query)}" placeholder="Aggiungi localita'" autocomplete="off" />
      <div class="favorites-add-actions">
        <button class="favorites-add-submit" type="submit" ${pending ? "disabled" : ""}>Aggiungi</button>
        <button id="favorites-add-cancel" class="favorites-add-cancel" type="button" aria-label="Annulla" ${pending ? "disabled" : ""}>&times;</button>
      </div>
    </form>
  `;
}
