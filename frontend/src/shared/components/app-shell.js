const NAV_ROUTES = new Set(["favorites", "forecast"]);

const NAV_ITEMS = {
  favorites: {
    icon: `
      <svg class="app-sidebar-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 3 2.75 5.57 6.15.9-4.45 4.33 1.05 6.12L12 17.03l-5.5 2.89 1.05-6.12L3.1 9.47l6.15-.9L12 3Z" />
      </svg>
    `,
    label: "Preferiti",
  },
  forecast: {
    icon: `
      <svg class="app-sidebar-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 11.5 12 5l8 6.5" />
        <path d="M6.5 10.5V20h11v-9.5" />
        <path d="M10 20v-5h4v5" />
      </svg>
    `,
    label: "Previsioni",
  },
};

function renderSidebarLink(pageId, label, activePage) {
  const item = NAV_ITEMS[pageId] || { icon: "", label };
  const isActive = pageId === activePage;
  const activeClass = isActive ? " is-active" : "";
  const currentPage = isActive ? ' aria-current="page"' : "";

  return `
    <button class="app-sidebar-link${activeClass}" type="button" data-app-nav="${pageId}" title="${item.label}" aria-label="${item.label}"${currentPage}>
      <span class="app-sidebar-icon-shell">${item.icon}</span>
      <span class="app-sidebar-label">${item.label}</span>
    </button>
  `;
}

export function renderAppHeader({ title, activePage = "forecast", actions = "" }) {
  const actionsMarkup = actions.trim()
    ? `<div class="app-header-actions header-actions">${actions}</div>`
    : "";

  return `
    <header class="app-header search-header">
      <aside id="app-sidebar" class="app-sidebar" aria-hidden="false">
        <nav class="app-sidebar-nav" aria-label="Navigazione principale">
          ${renderSidebarLink("forecast", "Previsioni", activePage)}
          ${renderSidebarLink("favorites", "Preferiti", activePage)}
        </nav>
      </aside>

      <div class="app-header-content header-content">
        <div class="app-header-primary header-primary">
          <button id="app-menu-toggle" class="app-menu-toggle" type="button" title="Apri menu" aria-label="Apri menu" aria-controls="app-sidebar" aria-expanded="false">
            <span class="app-menu-toggle-line" aria-hidden="true"></span>
            <span class="app-menu-toggle-line" aria-hidden="true"></span>
            <span class="app-menu-toggle-line" aria-hidden="true"></span>
          </button>
          <h1 class="app-header-title search-header-title">${title}</h1>
        </div>

        ${actionsMarkup}
      </div>
    </header>
  `;
}

export function bindAppShell(root, options = {}) {
  const appContainer = root.querySelector(".app-page-shell") || root.closest?.(".app-page-shell");
  const menuToggle = root.querySelector("#app-menu-toggle");
  const sidebar = root.querySelector("#app-sidebar");

  if (!appContainer || !menuToggle || !sidebar) {
    return null;
  }

  const controller = new AbortController();
  const listenerOptions = { signal: controller.signal };

  const setSidebarOpen = (isOpen) => {
    appContainer.classList.toggle("is-sidebar-open", isOpen);
    sidebar.classList.toggle("is-open", isOpen);
    sidebar.setAttribute("aria-hidden", "false");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Chiudi menu" : "Apri menu");
    menuToggle.setAttribute("title", isOpen ? "Chiudi menu" : "Apri menu");

    if (isOpen) {
      options.onOpen?.();
      return;
    }

    options.onClose?.();
  };

  menuToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    setSidebarOpen(!sidebar.classList.contains("is-open"));
  }, listenerOptions);

  sidebar.querySelectorAll("[data-app-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.appNav;

      if (NAV_ROUTES.has(target)) {
        setSidebarOpen(false);

        if (window.location.hash === `#${target}`) {
          updateAppNavState(root, target);
          return;
        }

        window.location.hash = target;
      }
    }, listenerOptions);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && sidebar.classList.contains("is-open")) {
      setSidebarOpen(false);
      menuToggle.focus();
    }
  }, listenerOptions);

  return {
    destroy() {
      setSidebarOpen(false);
      controller.abort();
    },
    setSidebarOpen,
  };
}

export function updateAppNavState(root, activePage = "forecast") {
  const scope = root?.querySelectorAll ? root : document;

  scope.querySelectorAll("[data-app-nav]").forEach((button) => {
    const isActive = button.dataset.appNav === activePage;

    button.classList.toggle("is-active", isActive);

    if (isActive) {
      button.setAttribute("aria-current", "page");
      return;
    }

    button.removeAttribute("aria-current");
  });
}
