"use strict";

const FALLBACK_TILES = [
  { id: "chatgpt", label: "ChatGPT", url: "https://chat.openai.com", icon_url: "images/chatgpt.png", icon_alt: "ChatGPT", hover_color: "#10a37f", position: 10, is_protected: false, icon_scale: 1, icon_invert: true },
  { id: "instagram", label: "Instagram", url: "https://instagram.com", icon_url: "https://cdn.simpleicons.org/instagram/FFFFFF", icon_alt: "Instagram", hover_color: "#df4996", position: 20, is_protected: false, icon_scale: 1, icon_invert: false },
  { id: "twitter", label: "Twitter", url: "https://twitter.com", icon_url: "https://cdn.simpleicons.org/x/FFFFFF", icon_alt: "Twitter", hover_color: "#1da1f2", position: 30, is_protected: false, icon_scale: 1, icon_invert: false },
  { id: "youtube", label: "YouTube", url: "https://youtube.com", icon_url: "https://cdn.simpleicons.org/youtube/FFFFFF", icon_alt: "YouTube", hover_color: "#ff0000", position: 40, is_protected: false, icon_scale: 1, icon_invert: false },
  { id: "twitch", label: "Twitch", url: "https://www.twitch.tv", icon_url: "https://cdn.simpleicons.org/twitch/FFFFFF", icon_alt: "Twitch", hover_color: "#9146ff", position: 50, is_protected: false, icon_scale: 1, icon_invert: false },
  { id: "cardmarket", label: "Cardmarket", url: "https://www.cardmarket.com", icon_url: "https://cdn.simpleicons.org/cardmarket/FFFFFF", icon_alt: "Cardmarket", hover_color: "#003366", position: 60, is_protected: false, icon_scale: 1, icon_invert: false },
  { id: "kicker", label: "Kicker", url: "https://www.kicker.de", icon_url: "images/kicker_k_white.png", icon_alt: "Kicker", hover_color: "#d60018", position: 70, is_protected: false, icon_scale: 1.3, icon_invert: false },
  { id: "kicktipp", label: "Kicktipp", url: "https://www.kicktipp.de", icon_url: "images/kt.png", icon_alt: "Kicktipp", hover_color: "#e50019", position: 80, is_protected: false, icon_scale: 0.95, icon_invert: false },
  { id: "bild", label: "Bild", url: "https://www.bild.de", icon_url: "images/bild_white.png", icon_alt: "Bild", hover_color: "#ed1c24", position: 90, is_protected: false, icon_scale: 1, icon_invert: false },
  { id: "transfermarkt", label: "Transfermarkt", url: "https://www.transfermarkt.de", icon_url: "images/tm.png", icon_alt: "Transfermarkt", hover_color: "#05396d", position: 100, is_protected: false, icon_scale: 0.95, icon_invert: false },
  { id: "amazon", label: "Amazon", url: "https://amazon.de", icon_url: "https://img.icons8.com/ios-filled/50/ffffff/amazon.png", icon_alt: "Amazon", hover_color: "#ff9900", position: 110, is_protected: false, icon_scale: 1, icon_invert: false },
  { id: "facebook", label: "Facebook", url: "https://facebook.com", icon_url: "https://cdn.simpleicons.org/facebook/FFFFFF", icon_alt: "Facebook", hover_color: "#1877f3", position: 120, is_protected: false, icon_scale: 1, icon_invert: false },
  { id: "mydealz", label: "mydealz", url: "https://www.mydealz.de", icon_url: "images/mydealz_two_tone.png", icon_alt: "Mydealz", hover_color: "#4dc431", position: 130, is_protected: false, icon_scale: 1.2, icon_invert: false },
  { id: "nas", label: "NAS", url: "http://QuickConnect.to/ikanoNAS", icon_url: "https://img.icons8.com/ios-filled/50/ffffff/server.png", icon_alt: "NAS", hover_color: "#0051ff", position: 140, is_protected: false, icon_scale: 1, icon_invert: false },
  { id: "reddit", label: "Reddit", url: "https://www.reddit.com", icon_url: "https://cdn.simpleicons.org/reddit/FFFFFF", icon_alt: "Reddit", hover_color: "#ff4500", position: 150, is_protected: false, icon_scale: 1, icon_invert: false },
];

const state = {
  client: null,
  user: null,
  isAdmin: false,
  tiles: [],
  draggedId: null,
  justDragged: false,
  suggestionIndex: -1,
  suggestions: [],
  suggestionRequest: 0,
  sessionToken: undefined,
  authMode: "login",
};

const elements = {
  body: document.body,
  logo: document.getElementById("logo"),
  tiles: document.getElementById("tiles"),
  tilesStatus: document.getElementById("tiles-status"),
  lockButton: document.getElementById("lock-btn"),
  addTileButton: document.getElementById("add-tile-btn"),
  clock: document.getElementById("clock"),
  loginModal: document.getElementById("login-modal"),
  loginForm: document.getElementById("login-form"),
  loginEmail: document.getElementById("login-email"),
  loginPassword: document.getElementById("login-password"),
  loginMessage: document.getElementById("login-message"),
  loginSubmit: document.getElementById("login-submit"),
  authModeToggle: document.getElementById("auth-mode-toggle"),
  tileModal: document.getElementById("tile-modal"),
  tileForm: document.getElementById("tile-form"),
  tileFormMessage: document.getElementById("tile-form-message"),
  tileSubmit: document.getElementById("tile-submit"),
  tileLabel: document.getElementById("tile-label"),
  tileUrl: document.getElementById("tile-url"),
  tileIconUrl: document.getElementById("tile-icon-url"),
  tileHoverColor: document.getElementById("tile-hover-color"),
  changelogModal: document.getElementById("changelog-modal"),
  versionInfo: document.getElementById("version-info"),
  weatherInfo: document.getElementById("weather-info"),
  weatherPanel: document.getElementById("weather-panel"),
  searchForm: document.getElementById("search-form"),
  searchInput: document.getElementById("search-input"),
  searchSuggestions: document.getElementById("search-suggestions"),
  searchWrapper: document.querySelector(".search-wrapper"),
  toast: document.getElementById("toast"),
};

let toastTimer;
let suggestionTimer;

function databaseConfigured() {
  const config = window.KH7_CONFIG || {};
  return Boolean(config.supabaseUrl && config.supabasePublishableKey && window.supabase?.createClient);
}

function showToast(message, type = "info") {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.remove("hidden", "error");
  if (type === "error") elements.toast.classList.add("error");
  toastTimer = window.setTimeout(() => elements.toast.classList.add("hidden"), 3500);
}

function openModal(modal, focusTarget) {
  modal.classList.remove("hidden");
  window.setTimeout(() => focusTarget?.focus(), 40);
}

function closeModal(modal) {
  modal.classList.add("hidden");
}

function closeAllModals() {
  document.querySelectorAll(".modal:not(.hidden)").forEach((modal) => closeModal(modal));
}

function updateClock() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  elements.clock.textContent = `${hours}:${minutes}`;
}

function weatherIcon(code) {
  if ([1, 2, 3].includes(code)) return "🌤️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55, 56, 57].includes(code)) return "🌦️";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "🌧️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "☀️";
}

async function loadCurrentWeather() {
  try {
    const response = await fetch("https://api.open-meteo.com/v1/forecast?latitude=51.6187&longitude=7.5287&current=temperature_2m,weathercode&timezone=Europe%2FBerlin");
    if (!response.ok) throw new Error("Wetter nicht erreichbar");
    const data = await response.json();
    const icon = weatherIcon(data.current.weathercode);
    elements.weatherInfo.innerHTML = `<span class="weather-emoji" aria-hidden="true">${icon}</span><span>${data.current.temperature_2m}&deg;C</span>`;
    elements.weatherInfo.title = "Fünf-Tage-Vorschau anzeigen";
  } catch {
    elements.weatherInfo.textContent = "n/a";
  }
}

async function loadForecast() {
  elements.weatherPanel.textContent = "Vorhersage wird geladen …";
  try {
    const response = await fetch("https://api.open-meteo.com/v1/forecast?latitude=51.6187&longitude=7.5287&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=Europe%2FBerlin");
    if (!response.ok) throw new Error("Vorhersage nicht erreichbar");
    const data = await response.json();
    const fragment = document.createDocumentFragment();
    const title = document.createElement("div");
    title.className = "forecast-title";
    title.textContent = "Vorhersage";
    fragment.appendChild(title);

    data.daily.time.slice(0, 5).forEach((time, index) => {
      const row = document.createElement("div");
      row.className = "forecast-day";
      const weekday = new Date(`${time}T12:00:00`).toLocaleDateString("de-DE", { weekday: "short" });
      const max = Math.round(data.daily.temperature_2m_max[index]);
      const min = Math.round(data.daily.temperature_2m_min[index]);
      row.innerHTML = `<span>${weekday}</span><span aria-hidden="true">${weatherIcon(data.daily.weathercode[index])}</span><span>${max}°/${min}°</span>`;
      fragment.appendChild(row);
    });
    elements.weatherPanel.replaceChildren(fragment);
  } catch {
    elements.weatherPanel.textContent = "Fehler beim Laden der Wetterdaten.";
  }
}

async function toggleWeather() {
  const opening = elements.weatherPanel.classList.contains("hidden");
  elements.weatherPanel.classList.toggle("hidden", !opening);
  elements.weatherInfo.setAttribute("aria-expanded", String(opening));
  if (opening && !elements.weatherPanel.dataset.loaded) {
    elements.weatherPanel.dataset.loaded = "true";
    await loadForecast();
  }
}

function applyAdminAppearance() {
  elements.body.classList.toggle("admin-mode", state.isAdmin);
  elements.tiles.classList.toggle("hidden", !state.isAdmin);
  elements.tilesStatus.classList.toggle("hidden", !state.isAdmin);
  elements.addTileButton.classList.toggle("hidden", !state.isAdmin);
  elements.lockButton.textContent = state.isAdmin ? "🔓" : "🔒";
  elements.lockButton.title = state.isAdmin ? "Abmelden" : "Anmelden";
  elements.lockButton.setAttribute("aria-label", state.isAdmin ? "Abmelden" : "Anmelden");
  document.documentElement.style.setProperty("--highlight-color", state.isAdmin ? "#ff0000" : "#00ff00");
  elements.logo.src = state.isAdmin ? "images/logo_red.png" : "images/logo_transparent.png";
  if (state.isAdmin) {
    elements.logo.classList.remove("flash");
    void elements.logo.offsetWidth;
    elements.logo.classList.add("flash");
  }
}

function safeHttpUrl(value, allowRelative = false) {
  const trimmed = value.trim();
  if (allowRelative && /^(images\/|\.\/images\/)[a-zA-Z0-9._/-]+$/.test(trimmed)) return trimmed;
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Die Adresse ist ungültig.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Nur HTTP- oder HTTPS-Adressen sind erlaubt.");
  return parsed.href;
}

function renderTiles() {
  const fragment = document.createDocumentFragment();
  state.tiles.forEach((tile) => {
    const shell = document.createElement("div");
    shell.className = "tile-shell";
    shell.dataset.id = tile.id;

    const link = document.createElement("a");
    link.className = "tile";
    link.href = tile.url;
    link.style.setProperty("--tile-hover", tile.hover_color || "#444444");
    link.style.setProperty("--icon-scale", String(tile.icon_scale || 1));
    link.draggable = state.isAdmin;

    const image = document.createElement("img");
    image.src = tile.icon_url || "images/link.svg";
    image.alt = tile.icon_alt || tile.label;
    image.loading = "lazy";
    if (tile.icon_invert) image.classList.add("inverted");
    image.addEventListener("error", () => {
      image.src = "images/link.svg";
      image.classList.add("inverted");
    }, { once: true });

    const label = document.createElement("span");
    label.textContent = tile.label;
    link.append(image, label);
    link.addEventListener("click", (event) => {
      if (state.justDragged) event.preventDefault();
    });
    shell.appendChild(link);

    if (state.isAdmin) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "tile-delete";
      deleteButton.textContent = "×";
      deleteButton.title = `${tile.label} löschen`;
      deleteButton.setAttribute("aria-label", `${tile.label} löschen`);
      deleteButton.addEventListener("click", () => deleteTile(tile));
      shell.appendChild(deleteButton);
      attachDragEvents(shell, link);
    }
    fragment.appendChild(shell);
  });
  elements.tiles.replaceChildren(fragment);
  elements.tilesStatus.textContent = state.isAdmin && !state.tiles.length ? "Noch keine Kacheln vorhanden." : "";
}

function attachDragEvents(shell, dragHandle) {
  dragHandle.addEventListener("dragstart", (event) => {
    state.draggedId = shell.dataset.id;
    state.justDragged = false;
    shell.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", state.draggedId);
  });
  dragHandle.addEventListener("dragend", () => {
    shell.classList.remove("dragging");
    document.querySelectorAll(".tile-shell.drag-over").forEach((item) => item.classList.remove("drag-over"));
    state.justDragged = true;
    window.setTimeout(() => { state.justDragged = false; }, 100);
  });
  shell.addEventListener("dragover", (event) => {
    if (!state.draggedId || state.draggedId === shell.dataset.id) return;
    event.preventDefault();
    shell.classList.add("drag-over");
  });
  shell.addEventListener("dragleave", () => shell.classList.remove("drag-over"));
  shell.addEventListener("drop", async (event) => {
    event.preventDefault();
    shell.classList.remove("drag-over");
    if (!state.draggedId || state.draggedId === shell.dataset.id) return;
    const fromIndex = state.tiles.findIndex((tile) => tile.id === state.draggedId);
    const toIndex = state.tiles.findIndex((tile) => tile.id === shell.dataset.id);
    if (fromIndex < 0 || toIndex < 0) return;
    const [moved] = state.tiles.splice(fromIndex, 1);
    state.tiles.splice(toIndex, 0, moved);
    renderTiles();
    await persistTileOrder();
  });
}

async function persistTileOrder() {
  if (!state.client || !state.isAdmin) return;
  const updates = state.tiles.map((tile, index) => state.client.from("tiles").update({ position: (index + 1) * 10 }).eq("id", tile.id));
  const results = await Promise.all(updates);
  if (results.find((result) => result.error)) {
    showToast("Die neue Reihenfolge konnte nicht gespeichert werden.", "error");
    await loadTiles();
    return;
  }
  state.tiles.forEach((tile, index) => { tile.position = (index + 1) * 10; });
  showToast("Reihenfolge gespeichert.");
}

async function loadTiles() {
  if (!state.isAdmin) {
    state.tiles = [];
    renderTiles();
    return;
  }
  elements.tilesStatus.textContent = "Kacheln werden geladen …";
  if (!state.client) {
    state.tiles = FALLBACK_TILES.map((tile) => ({ ...tile }));
    renderTiles();
    return;
  }
  const { data, error } = await state.client
    .from("tiles")
    .select("id,label,url,icon_url,icon_alt,hover_color,position,is_protected,icon_scale,icon_invert")
    .order("position", { ascending: true });
  if (error) {
    state.tiles = FALLBACK_TILES.map((tile) => ({ ...tile }));
    renderTiles();
    showToast("Datenbank nicht erreichbar – Standardkacheln werden angezeigt.", "error");
    return;
  }
  state.tiles = data || [];
  renderTiles();
}

async function verifyAdmin(user) {
  if (!state.client || !user) return false;
  const { data, error } = await state.client.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  return !error && Boolean(data);
}

async function applySession(session) {
  const sessionToken = session?.access_token || null;
  if (state.sessionToken === sessionToken) return;
  state.sessionToken = sessionToken;
  if (!session?.user) {
    state.user = null;
    state.isAdmin = false;
    applyAdminAppearance();
    await loadTiles();
    return;
  }
  const isAdmin = await verifyAdmin(session.user);
  if (!isAdmin) {
    await state.client.auth.signOut();
    showToast("Dieses Konto besitzt keine Adminrechte.", "error");
    return;
  }
  state.user = session.user;
  state.isAdmin = true;
  applyAdminAppearance();
  await loadTiles();
}

async function initializeDatabase() {
  if (!databaseConfigured()) {
    state.client = null;
    await loadTiles();
    return;
  }
  const config = window.KH7_CONFIG;
  state.client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const { data, error } = await state.client.auth.getSession();
  if (error) showToast("Die Anmeldung konnte nicht geprüft werden.", "error");
  await applySession(data?.session || null);
  state.client.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => applySession(session), 0);
  });
}

async function handleLogin(event) {
  event.preventDefault();
  elements.loginMessage.textContent = "";
  if (!state.client) {
    elements.loginMessage.textContent = "Die Datenbank ist noch nicht verbunden.";
    return;
  }
  elements.loginSubmit.disabled = true;
  elements.loginSubmit.textContent = state.authMode === "signup" ? "Konto wird erstellt …" : "Anmeldung läuft …";

  if (state.authMode === "signup") {
    const { data, error } = await state.client.auth.signUp({
      email: elements.loginEmail.value.trim(),
      password: elements.loginPassword.value,
      options: {
        emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
      },
    });
    elements.loginSubmit.disabled = false;
    elements.loginSubmit.textContent = "Konto einrichten";
    if (error || !data.user) {
      elements.loginMessage.textContent = error?.message || "Das Konto konnte nicht erstellt werden.";
      return;
    }
    if (data.session) await state.client.auth.signOut();
    elements.loginForm.reset();
    elements.loginMessage.classList.add("success");
    elements.loginMessage.textContent = "Konto erstellt. Bestätige gegebenenfalls die E-Mail und gib mir danach kurz Bescheid, damit ich die Adminrechte freischalte.";
    return;
  }

  const { data, error } = await state.client.auth.signInWithPassword({
    email: elements.loginEmail.value.trim(),
    password: elements.loginPassword.value,
  });
  elements.loginSubmit.disabled = false;
  elements.loginSubmit.textContent = "Anmelden";
  if (error || !data.session) {
    elements.loginMessage.textContent = "E-Mail oder Passwort ist nicht korrekt.";
    elements.loginPassword.select();
    return;
  }
  if (!await verifyAdmin(data.user)) {
    await state.client.auth.signOut();
    elements.loginMessage.textContent = "Dieses Konto besitzt keine Adminrechte.";
    return;
  }
  elements.loginForm.reset();
  closeModal(elements.loginModal);
  await applySession(data.session);
  showToast("Erfolgreich angemeldet.");
}

function setAuthMode(mode) {
  state.authMode = mode;
  const signup = mode === "signup";
  document.getElementById("login-title").textContent = signup ? "Admin-Konto einrichten" : "Anmelden";
  elements.loginSubmit.textContent = signup ? "Konto einrichten" : "Anmelden";
  elements.authModeToggle.textContent = signup ? "Zurück zur Anmeldung" : "Erstes Admin-Konto einrichten";
  elements.loginMessage.textContent = "";
  elements.loginMessage.classList.remove("success");
}

async function handleLockButton() {
  if (!state.isAdmin) {
    setAuthMode("login");
    openModal(elements.loginModal, elements.loginEmail);
    return;
  }
  if (state.client) await state.client.auth.signOut();
  showToast("Abgemeldet.");
}

async function handleAddTile(event) {
  event.preventDefault();
  if (!state.client || !state.isAdmin) return;
  elements.tileFormMessage.textContent = "";
  let url;
  let iconUrl = "images/link.svg";
  try {
    url = safeHttpUrl(elements.tileUrl.value);
    if (elements.tileIconUrl.value.trim()) iconUrl = safeHttpUrl(elements.tileIconUrl.value, true);
  } catch (error) {
    elements.tileFormMessage.textContent = error.message;
    return;
  }
  elements.tileSubmit.disabled = true;
  elements.tileSubmit.textContent = "Wird gespeichert …";
  const maxPosition = state.tiles.reduce((max, tile) => Math.max(max, Number(tile.position) || 0), 0);
  const { error } = await state.client.from("tiles").insert({
    label: elements.tileLabel.value.trim(),
    url,
    icon_url: iconUrl,
    icon_alt: elements.tileLabel.value.trim(),
    hover_color: elements.tileHoverColor.value,
    position: maxPosition + 10,
    is_protected: true,
    icon_scale: 1,
    icon_invert: iconUrl === "images/link.svg",
  });
  elements.tileSubmit.disabled = false;
  elements.tileSubmit.textContent = "Kachel speichern";
  if (error) {
    elements.tileFormMessage.textContent = "Die Kachel konnte nicht gespeichert werden.";
    return;
  }
  elements.tileForm.reset();
  elements.tileHoverColor.value = "#444444";
  closeModal(elements.tileModal);
  await loadTiles();
  showToast("Kachel hinzugefügt.");
}

async function deleteTile(tile) {
  if (!state.client || !state.isAdmin) return;
  if (!window.confirm(`„${tile.label}“ wirklich löschen?`)) return;
  const { error } = await state.client.from("tiles").delete().eq("id", tile.id);
  if (error) {
    showToast("Die Kachel konnte nicht gelöscht werden.", "error");
    return;
  }
  state.tiles = state.tiles.filter((item) => item.id !== tile.id);
  renderTiles();
  await persistTileOrder();
  showToast("Kachel gelöscht.");
}

function hideSuggestions() {
  elements.searchSuggestions.classList.add("hidden");
  elements.searchWrapper.classList.remove("suggestions-open");
  elements.searchInput.setAttribute("aria-expanded", "false");
  elements.searchInput.removeAttribute("aria-activedescendant");
  state.suggestionIndex = -1;
}

function updateSuggestionSelection() {
  const items = elements.searchSuggestions.querySelectorAll(".search-suggestion");
  items.forEach((item, index) => item.classList.toggle("active", index === state.suggestionIndex));
  if (state.suggestionIndex >= 0 && items[state.suggestionIndex]) {
    elements.searchInput.setAttribute("aria-activedescendant", items[state.suggestionIndex].id);
  } else {
    elements.searchInput.removeAttribute("aria-activedescendant");
  }
}

function chooseSuggestion(value) {
  elements.searchInput.value = value;
  hideSuggestions();
  elements.searchForm.requestSubmit();
}

function renderSuggestions(suggestions) {
  state.suggestions = suggestions.slice(0, 8);
  state.suggestionIndex = -1;
  if (!state.suggestions.length) {
    hideSuggestions();
    return;
  }
  const fragment = document.createDocumentFragment();
  state.suggestions.forEach((suggestion, index) => {
    const item = document.createElement("li");
    item.id = `search-suggestion-${index}`;
    item.className = "search-suggestion";
    item.role = "option";
    item.textContent = suggestion;
    item.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      chooseSuggestion(suggestion);
    });
    fragment.appendChild(item);
  });
  elements.searchSuggestions.replaceChildren(fragment);
  elements.searchSuggestions.classList.remove("hidden");
  elements.searchWrapper.classList.add("suggestions-open");
  elements.searchInput.setAttribute("aria-expanded", "true");
}

function requestGoogleSuggestions(query) {
  const requestId = ++state.suggestionRequest;
  const callbackName = `kh7GoogleSuggestions_${Date.now()}_${requestId}`;
  const script = document.createElement("script");
  let timeout;
  const cleanup = () => {
    window.clearTimeout(timeout);
    script.remove();
    delete window[callbackName];
  };
  window[callbackName] = (payload) => {
    cleanup();
    if (requestId !== state.suggestionRequest) return;
    const suggestions = Array.isArray(payload?.[1]) ? payload[1].filter((item) => typeof item === "string") : [];
    renderSuggestions(suggestions);
  };
  script.charset = "ISO-8859-1";
  script.async = true;
  script.src = `https://suggestqueries.google.com/complete/search?client=chrome&hl=de&callback=${encodeURIComponent(callbackName)}&q=${encodeURIComponent(query)}`;
  script.addEventListener("error", () => {
    cleanup();
    if (requestId === state.suggestionRequest) hideSuggestions();
  });
  timeout = window.setTimeout(() => {
    cleanup();
    if (requestId === state.suggestionRequest) hideSuggestions();
  }, 4500);
  document.head.appendChild(script);
}

function handleSearchInput() {
  window.clearTimeout(suggestionTimer);
  const query = elements.searchInput.value.trim();
  if (query.length < 2) {
    state.suggestionRequest += 1;
    hideSuggestions();
    return;
  }
  suggestionTimer = window.setTimeout(() => requestGoogleSuggestions(query), 180);
}

function handleSearchKeys(event) {
  if (elements.searchSuggestions.classList.contains("hidden")) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    state.suggestionIndex = Math.min(state.suggestionIndex + 1, state.suggestions.length - 1);
    updateSuggestionSelection();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    state.suggestionIndex = Math.max(state.suggestionIndex - 1, -1);
    updateSuggestionSelection();
  } else if (event.key === "Enter" && state.suggestionIndex >= 0) {
    event.preventDefault();
    chooseSuggestion(state.suggestions[state.suggestionIndex]);
  } else if (event.key === "Escape") {
    hideSuggestions();
  }
}

function bindEvents() {
  elements.weatherInfo.addEventListener("click", toggleWeather);
  elements.lockButton.addEventListener("click", handleLockButton);
  elements.authModeToggle.classList.toggle("hidden", !window.KH7_CONFIG?.allowSignup);
  elements.authModeToggle.addEventListener("click", () => setAuthMode(state.authMode === "login" ? "signup" : "login"));
  elements.addTileButton.addEventListener("click", () => {
    elements.tileFormMessage.textContent = "";
    openModal(elements.tileModal, elements.tileLabel);
  });
  elements.loginForm.addEventListener("submit", handleLogin);
  elements.tileForm.addEventListener("submit", handleAddTile);
  elements.versionInfo.addEventListener("click", () => openModal(elements.changelogModal));
  elements.searchInput.addEventListener("input", handleSearchInput);
  elements.searchInput.addEventListener("keydown", handleSearchKeys);
  elements.searchInput.addEventListener("focus", () => {
    if (state.suggestions.length && elements.searchInput.value.trim().length >= 2) renderSuggestions(state.suggestions);
  });
  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => closeModal(button.closest(".modal")));
  });
  document.addEventListener("pointerdown", (event) => {
    if (!elements.searchWrapper.contains(event.target)) hideSuggestions();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAllModals();
  });
}

async function initialize() {
  localStorage.removeItem("tilesOrder");
  bindEvents();
  updateClock();
  window.setInterval(updateClock, 1000);
  loadCurrentWeather();
  await initializeDatabase();
}

initialize();
