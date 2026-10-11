"use strict";

// Each module owns its renderer; new modules only need a catalog entry and renderer.
(() => {
  const catalog = [
    { id: "notes", title: "Notizen", description: "Eine neue Haftnotiz mit eigener Farbe hinzufügen.", render: renderNotes },
    { id: "crypto", title: "Krypto-Portfolio", description: "Eigene Coins und Mengen, aktuelle Kurse und Gesamtwert.", render: renderCrypto },
    { id: "cs2", title: "CS2-Inventare", description: "Mehrere Steam-Profile und ihre geschätzten Inventarwerte.", render: renderCS2 },
  ];
  const panel = document.getElementById("modules-panel");
  const grid = document.getElementById("modules-grid");
  const notesDock = document.getElementById("notes-dock");
  const rightNotesDock = document.getElementById("notes-dock-right");
  const rightRail = document.getElementById("dashboard-right-rail");
  let draggedNoteId = null;
  const portfolioButton = document.getElementById("portfolio-info");
  const portfolioPanel = document.getElementById("portfolio-panel");
  const inventoryInfo = document.getElementById("inventory-info");
  const inventoryValues = document.getElementById("inventory-values");
  const inventorySettings = document.getElementById("inventory-settings");
  const inventoryPanel = document.getElementById("inventory-panel");
  let inventoryOpen = false;
  let portfolioOpen = false;
  let cryptoSettingsOpen = false;
  const cryptoSettings = el("button", "⚙", "module-button inventory-picker-settings hidden");
  cryptoSettings.type = "button"; cryptoSettings.dataset.manageCrypto = "";
  cryptoSettings.title = "Krypto-Portfolio verwalten"; cryptoSettings.setAttribute("aria-label", "Krypto-Portfolio verwalten");
  cryptoSettings.setAttribute("aria-controls", "portfolio-panel");
  let sessionEpoch = 0;
  let cloudReady = false;
  let noteDirty = false;
  let noteRevision = 0;
  let cloudTimer;
  let cloudWrites = Promise.resolve();
  let noteStatus = "Notiz wird aus deinem Konto geladen …";
  let userId = null;
  let generation = 0;
  let controllers = [];
  let settings = defaults();
  let marketsPromise;
  let cryptoBusy = false;
  let inventoryBusy = false;
  const prices = new Map();
  const inventories = new Map();
  let cryptoTime = null;
  const noteColors = [["yellow", "Gelb"], ["pink", "Rosa"], ["blue", "Blau"], ["green", "Grün"], ["purple", "Lila"]];

  function defaults() { return { enabled: [], notes: "", noteColor: "yellow", noteItems: [], currency: "EUR", holdings: [], profiles: [], valuation: "steam" }; }
  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function button(text, action) {
    const node = el("button", text, "module-button");
    node.type = "button";
    node.addEventListener("click", action);
    return node;
  }
  function message(parent, text) { const node = el("p", text, "module-muted"); parent.append(node); return node; }
  function money(value) { return new Intl.NumberFormat("de-DE", { style: "currency", currency: settings.currency }).format(value); }
  function storageKey() { return `kh7-modules-v1:${userId}`; }
  function save() {
    if (!userId) return false;
    noteRevision++; noteDirty = true; queueNoteSave();
    return true;
  }
  function clearLegacyStorage() {
    try { localStorage.removeItem(storageKey()); } catch { /* Migration cleanup can retry next sign-in. */ }
  }
  function updateNoteStatus(text) {
    noteStatus = text;
    [notesDock, rightNotesDock].forEach(dock => dock.querySelectorAll("[data-note-status]").forEach(status => { status.textContent = text; status.classList.toggle("hidden", !/^Cloud/.test(text)); }));
  }
  function queueNoteSave() {
    updateNoteStatus(cloudReady ? "Wird in deinem Konto gespeichert …" : "Notiz wird synchronisiert …");
    clearTimeout(cloudTimer);
    if (!cloudReady) return;
    cloudTimer = window.setTimeout(writeNote, 400);
  }
  function writeNote() {
    if (!userId || !cloudReady || !noteDirty) return;
    const epoch = sessionEpoch;
    const revision = noteRevision;
    const client = state.client;
    const payload = { user_id: userId, content: settings.noteItems[0]?.content || "", color: settings.noteItems[0]?.color || "yellow", note_items: settings.noteItems.map(note => ({ ...note })), enabled: settings.enabled.includes("notes"), module_settings: { enabled: [...settings.enabled], currency: settings.currency, holdings: settings.holdings.map(item => ({ ...item })), profiles: settings.profiles.map(item => ({ ...item })), valuation: settings.valuation, activeCSProfile: settings.activeCSProfile || "" }, updated_at: new Date().toISOString() };
    cloudWrites = cloudWrites.catch(() => {}).then(async () => {
      if (epoch !== sessionEpoch) return;
      try {
        const result = await client.from("dashboard_notes").upsert(payload, { onConflict: "user_id" });
        if (result.error) throw result.error;
        if (epoch === sessionEpoch && revision === noteRevision) { noteDirty = false; clearLegacyStorage(); updateNoteStatus("In deinem Konto gespeichert"); }
      } catch {
        if (epoch === sessionEpoch) { updateNoteStatus("Cloud-Speicherung fehlgeschlagen · Änderungen sind noch nicht online gespeichert. Bitte diese Seite offen lassen."); showToast("Dashboard konnte nicht online gespeichert werden. Bitte die Seite offen lassen; der Abruf wird automatisch wiederholt.", "error"); }
      }
    });
  }
  async function loadCloudNotes() {
    const epoch = sessionEpoch;
    const revision = noteRevision;
    try {
      const result = await state.client.from("dashboard_notes").select("content,color,enabled,note_items,module_settings").eq("user_id", userId).maybeSingle();
      if (epoch !== sessionEpoch) return;
      if (result.error) throw result.error;
      cloudReady = true;
      if (revision === noteRevision) {
        if (result.data?.module_settings) {
          // The online account is authoritative after the one-time migration.
          settings = normalizeSettings({ ...result.data.module_settings, noteItems: result.data.note_items });
          noteDirty = false; clearLegacyStorage();
        } else {
          // Keep legacy browser portfolio/profile data and existing online notes.
          if (result.data && !settings.notesPending) {
            settings.noteItems = normalizeNotes(result.data);
            settings.enabled = settings.enabled.filter(id => id !== "notes");
            if (result.data.enabled) settings.enabled.push("notes");
          }
          noteDirty = true; queueNoteSave();
        }
        updateNoteStatus("Aus deinem Konto geladen"); render();
        if (settings.enabled.includes("crypto") && settings.holdings.length) refreshCrypto();
        if (settings.enabled.includes("cs2") && settings.profiles.length) refreshInventories();
      } else if (noteDirty) queueNoteSave();
    } catch {
      if (epoch === sessionEpoch) { updateNoteStatus("Cloud nicht erreichbar · bitte später erneut versuchen."); showToast("Dashboard konnte nicht aus deinem Konto geladen werden. Automatischer Neuversuch folgt.", "error"); }
    }
  }
  function newNoteId() { return window.crypto?.randomUUID?.() || `note-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  function normalizeNotes(data) {
    const source = Array.isArray(data.note_items) ? data.note_items : Array.isArray(data.noteItems) ? data.noteItems : (data.content || data.notes || data.enabled === true || data.enabled?.includes?.("notes")) ? [{ id: "legacy-note", content: data.content ?? data.notes, color: data.color ?? data.noteColor }] : [];
    const ids = new Set();
    return source.slice(0, 50).filter(note => note && typeof note === "object").map(note => {
      let id = typeof note.id === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(note.id) && !ids.has(note.id) ? note.id : newNoteId();
      ids.add(id);
      return { id, content: typeof note.content === "string" ? note.content.slice(0, 20000) : "", color: noteColors.some(([key]) => key === note.color) ? note.color : "yellow", collapsed: note.collapsed === true, side: note.side === "right" ? "right" : "left", width: Number.isFinite(note.width) ? Math.max(220, Math.min(480, Math.round(note.width))) : null, height: Number.isFinite(note.height) ? Math.max(220, Math.min(800, Math.round(note.height))) : null };
    });
  }
  function normalizeSettings(data) {
    if (!data || typeof data !== "object") return defaults();
    return {
        enabled: [...new Set(Array.isArray(data.enabled) ? data.enabled.filter(id => catalog.some(item => item.id === id)) : [])],
        notes: typeof data.notes === "string" ? data.notes.slice(0, 20000) : "",
        noteColor: noteColors.some(([key]) => key === data.noteColor) ? data.noteColor : "yellow",
        noteItems: normalizeNotes(data),
        notesPending: Boolean(data.notesPending),
        currency: ["EUR", "USD"].includes(data.currency) ? data.currency : "EUR",
        holdings: Array.isArray(data.holdings) ? data.holdings.filter(h => h && /^[A-Z0-9]{1,15}$/.test(h.symbol) && Number.isFinite(h.amount) && h.amount > 0).slice(0, 30) : [],
        profiles: Array.isArray(data.profiles) ? data.profiles.filter(p => p && typeof p.label === "string" && validProfile(p.profile)).slice(0, 10) : [],
        valuation: data.valuation === "cash" ? "cash" : "steam",
        activeCSProfile: typeof data.activeCSProfile === "string" ? data.activeCSProfile : "",
      };
  }
  function load() {
    // Read old browser data only to migrate it; new changes never use local storage.
    try { return normalizeSettings(JSON.parse(localStorage.getItem(storageKey()) || "null")); }
    catch { return defaults(); }
  }
  function cancelRequests() { controllers.forEach(c => c.abort()); controllers = []; }
  function invalidate() { generation++; cancelRequests(); cryptoBusy = false; inventoryBusy = false; }
  function changeCurrency(value) {
    invalidate(); settings.currency = value;
    prices.clear(); inventories.clear(); cryptoTime = null; save(); render(); refreshCrypto();
  }
  async function json(url, options = {}) {
    const controller = new AbortController();
    controllers.push(controller);
    const timeout = window.setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const type = response.headers.get("content-type") || "";
      if (!type.includes("application/json")) throw new Error("Der Inventardienst ist auf diesem Webserver noch nicht eingerichtet.");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Daten konnten nicht abgerufen werden.");
      return body;
    } finally { clearTimeout(timeout); controllers = controllers.filter(c => c !== controller); }
  }
  function setSession(detail) {
    const nextId = detail.isAdmin ? detail.userId : null;
    if (nextId === userId) return;
    sessionEpoch++; clearTimeout(cloudTimer);
    draggedNoteId = null; document.body.classList.remove("notes-dragging");
    cloudReady = false; noteDirty = false; noteRevision = 0;
    noteStatus = "Notiz wird aus deinem Konto geladen …";
    portfolioOpen = false; cryptoSettingsOpen = false;
    inventoryOpen = false;
    generation++;
    cancelRequests();
    userId = nextId;
    prices.clear(); inventories.clear(); cryptoTime = null;
    cryptoBusy = false; inventoryBusy = false;
    settings = userId ? load() : defaults();
    noteDirty = Boolean(settings.notesPending);
    picker.classList.add("hidden");
    panel.classList.toggle("hidden", !userId);
    render();
    if (userId) loadCloudNotes();
    
  }
  function render() {
    updateNoteRailWidths();
    portfolioPanel.classList.toggle("portfolio-summary", !cryptoSettingsOpen);
    grid.replaceChildren();
    notesDock.replaceChildren(); rightNotesDock.replaceChildren(); portfolioPanel.replaceChildren(); inventoryPanel.replaceChildren();
    const showNotes = Boolean(userId && cloudReady && settings.enabled.includes("notes"));
    const showPortfolio = Boolean(userId && cloudReady && settings.enabled.includes("crypto"));
    panel.classList.add("hidden");
    notesDock.classList.toggle("hidden", !showNotes || !settings.noteItems.some(note => note.side !== "right"));
    const showRightNotes = showNotes && settings.noteItems.some(note => note.side === "right");
    rightNotesDock.classList.toggle("hidden", !showRightNotes);
    rightRail.classList.toggle("hidden", !showRightNotes);
    renderInventoryHeader();
    portfolioButton.classList.toggle("hidden", !showPortfolio);
    portfolioPanel.classList.toggle("hidden", !showPortfolio || !portfolioOpen);
    portfolioButton.setAttribute("aria-expanded", String(showPortfolio && portfolioOpen));
    const total = settings.holdings.reduce((sum, h) => sum + (prices.get(h.symbol)?.price || 0) * h.amount, 0);
    const complete = settings.holdings.length && settings.holdings.every(h => prices.has(h.symbol));
    portfolioButton.textContent = `Portfolio ${prices.size ? (complete ? "" : "≈ ") + money(total) : "—"}`;
    document.getElementById("modules-empty").classList.toggle("hidden", settings.enabled.length > 0);
    if (!userId || !cloudReady) return;
    for (const id of settings.enabled) {
      const module = catalog.find(item => item.id === id);
      if (id === "notes") {
        settings.noteItems.forEach((note, index) => {
          const card = el("article", undefined, "module-card");
          card.dataset.module = "notes"; card.dataset.noteId = note.id;
          renderNotes(card, note, index); (note.side === "right" ? rightNotesDock : notesDock).append(card);
        });
        continue;
      }
      if (id === "crypto" && !cryptoSettingsOpen) { renderCryptoSummary(portfolioPanel); continue; }
      const card = el("article", undefined, "module-card");
      card.dataset.module = id;
      const heading = el("div", undefined, "module-heading");
      heading.append(el("h3", module.title), button("Ausblenden", () => {
        generation++; cancelRequests(); cryptoBusy = false; inventoryBusy = false;
        settings.enabled = settings.enabled.filter(value => value !== id);
        save(id === "notes"); render();
      }));
      card.append(heading);
      module.render(card);
      (id === "notes" ? notesDock : id === "crypto" ? portfolioPanel : inventoryPanel).append(card);
    }
  }
  function renderNotes(card, note, index) {
    const heading = el("div", undefined, "module-heading");
    const handle = button("⠿", () => moveNote(note.id, note.side === "right" ? "left" : "right"));
    handle.className = "module-button note-drag-handle";
    handle.draggable = true;
    handle.dataset.noteDrag = "";
    handle.title = "Zum Verschieben ziehen · Klicken wechselt die Seite";
    handle.setAttribute("aria-label", `Notiz ${index + 1} verschieben. Ziehen oder klicken zum Seitenwechsel.`);
    handle.addEventListener("dragstart", event => {
      if (!userId) { event.preventDefault(); return; }
      draggedNoteId = note.id;
      event.dataTransfer.setData("text/plain", note.id);
      event.dataTransfer.effectAllowed = "move";
      document.body.classList.add("notes-dragging");
      [notesDock, rightNotesDock, rightRail].forEach(node => node.classList.remove("hidden"));
    });
    handle.addEventListener("dragend", () => { draggedNoteId = null; document.body.classList.remove("notes-dragging"); render(); });
    handle.addEventListener("keydown", event => {
      if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); reorderNote(note, event.key === "ArrowUp" ? -1 : 1); }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); moveNote(note.id, event.key === "ArrowRight" ? "right" : "left"); }
    });
    card.addEventListener("dragover", event => { if (draggedNoteId) event.preventDefault(); });
    card.addEventListener("drop", event => {
      if (!draggedNoteId) return;
      event.preventDefault(); event.stopPropagation();
      moveNote(draggedNoteId, note.side === "right" ? "right" : "left", note.id);
    });
    const title = el("h3", `Notiz ${settings.noteItems.indexOf(note) + 1}`);
    const body = el("div", undefined, "note-content"); body.id = `note-body-${note.id}`;
    const toggle = button("", () => { note.collapsed = !note.collapsed; updateCollapsed(); save(true); });
    toggle.dataset.noteToggle = "";
    toggle.setAttribute("aria-controls", body.id);
    function updateCollapsed() {
      applyNoteSize(card, note);
      body.classList.toggle("hidden", note.collapsed);
      card.classList.toggle("note-collapsed", note.collapsed);
      toggle.textContent = note.collapsed ? "+" : "−";
      toggle.title = note.collapsed ? "Aufklappen" : "Zuklappen";
      toggle.setAttribute("aria-label", toggle.title);
      toggle.setAttribute("aria-expanded", String(!note.collapsed));
      title.textContent = note.collapsed && note.content.trim() ? note.content.trim().split("\n")[0] : `Notiz ${settings.noteItems.indexOf(note) + 1}`;
    }
    const remove = button("", () => {
      if (!window.confirm("Diese Notiz löschen?")) return;
      settings.noteItems = settings.noteItems.filter(item => item.id !== note.id);
      save(true); render();
    });
    const binIcon = el("span", "", "trash-icon"); binIcon.setAttribute("aria-hidden", "true"); remove.append(binIcon);
    remove.classList.add("note-delete"); remove.title = "Notiz löschen";
    remove.setAttribute("aria-label", "Notiz löschen");
    heading.append(handle, title, toggle, remove); card.append(heading, body); updateCollapsed();
    card.classList.add("sticky-note");
    card.dataset.noteColor = note.color;
    card.dataset.noteSide = note.side || "left";
    const palette = el("div", undefined, "note-palette");
    palette.setAttribute("role", "group");
    palette.setAttribute("aria-label", "Notizfarbe");
    for (const [color, name] of noteColors) {
      const swatch = button("", () => {
        note.color = color;
        card.dataset.noteColor = color;
        palette.querySelectorAll("button").forEach(item => item.setAttribute("aria-pressed", String(item.dataset.color === color)));
        save(true);
      });
      swatch.className = "note-swatch";
      swatch.dataset.color = color;
      swatch.title = name;
      swatch.setAttribute("aria-label", `Notizfarbe ${name}`);
      swatch.setAttribute("aria-pressed", String(note.color === color));
      palette.append(swatch);
    }
    const input = el("textarea");
    input.setAttribute("aria-label", `Notiz ${index + 1}`);
    input.placeholder = "Was möchtest du festhalten?";
    input.maxLength = 20000;
    input.value = note.content;
    const status = el("p", noteStatus, "module-muted");
    status.classList.toggle("hidden", !/^Cloud/.test(noteStatus));
    status.dataset.noteStatus = "";
    status.setAttribute("aria-live", "polite");
    input.addEventListener("input", () => {
      note.content = input.value;
      save(true);
    });
    body.append(palette, input, status);
    const resize = button("↘", () => {}); resize.classList.add("note-resize-handle"); resize.dataset.noteResize = "";
    resize.title = "Größe ziehen · Pfeiltasten ändern die Größe"; resize.setAttribute("aria-label", "Notizgröße ändern");
    let resizeStart = null;
    resize.addEventListener("pointerdown", event => {
      if (event.button > 0 || event.isPrimary === false || note.collapsed) return;
      event.preventDefault(); event.stopPropagation();
      const rect = card.getBoundingClientRect();
      resizeStart = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height, oldWidth: note.width, oldHeight: note.height, pointerId: event.pointerId };
      resize.setPointerCapture(event.pointerId);
    });
    resize.addEventListener("pointermove", event => {
      if (!resizeStart || event.pointerId !== resizeStart.pointerId) return;
      const direction = note.side === "right" ? -1 : 1;
      note.width = Math.max(220, Math.min(480, Math.round(resizeStart.width + (event.clientX - resizeStart.x) * direction)));
      note.height = Math.max(220, Math.min(800, Math.round(resizeStart.height + event.clientY - resizeStart.y)));
      updateNoteRailWidths(); applyNoteSize(card, note);
    });
    function finishResize(event, cancelled) {
      if (!resizeStart || event.pointerId !== resizeStart.pointerId) return;
      if (cancelled) { note.width = resizeStart.oldWidth; note.height = resizeStart.oldHeight; }
      resizeStart = null; updateNoteRailWidths(); applyNoteSize(card, note);
      if (!cancelled) save();
    }
    resize.addEventListener("pointerup", event => finishResize(event, false));
    resize.addEventListener("pointercancel", event => finishResize(event, true));
    resize.addEventListener("keydown", event => {
      if (note.collapsed || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const rect = card.getBoundingClientRect();
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") note.width = Math.max(220, Math.min(480, Math.round(rect.width) + (event.key === "ArrowRight" ? 20 : -20)));
      else note.height = Math.max(220, Math.min(800, Math.round(rect.height) + (event.key === "ArrowDown" ? 20 : -20)));
      updateNoteRailWidths(); applyNoteSize(card, note); save();
    });
    card.append(resize);
  }
  function applyNoteSize(card, note) {
    card.style.width = note.width ? `${note.width}px` : "";
    card.style.height = !note.collapsed && note.height ? `${note.height}px` : "";
    card.classList.toggle("note-sized", Boolean(note.height && !note.collapsed));
  }
  function updateNoteRailWidths() {
    for (const side of ["left", "right"]) {
      const width = Math.max(280, ...settings.noteItems.filter(note => (note.side || "left") === side).map(note => (note.width || 272) + 8));
      document.body.style.setProperty(`--${side}-note-width`, `${width}px`);
    }
  }
  function reorderNote(note, direction) {
    const peers = settings.noteItems.filter(item => (item.side || "left") === (note.side || "left"));
    const other = peers[peers.indexOf(note) + direction]; if (!other) return;
    const from = settings.noteItems.indexOf(note), to = settings.noteItems.indexOf(other);
    [settings.noteItems[from], settings.noteItems[to]] = [settings.noteItems[to], settings.noteItems[from]];
    save(); render();
  }
  function moveNote(id, side, beforeId) {
    if (!userId) return;
    const note = settings.noteItems.find(item => item.id === id);
    if (!note || id === beforeId) return;
    note.side = side;
    settings.noteItems = settings.noteItems.filter(item => item !== note);
    const targetIndex = beforeId ? settings.noteItems.findIndex(item => item.id === beforeId) : -1;
    if (targetIndex >= 0) settings.noteItems.splice(targetIndex, 0, note);
    else settings.noteItems.push(note);
    draggedNoteId = null; document.body.classList.remove("notes-dragging");
    save(true); render();
    const dock = side === "right" ? rightNotesDock : notesDock;
    [...dock.children].find(item => item.dataset.noteId === id)?.querySelector("[data-note-drag]")?.focus();
  }
  for (const [dock, side] of [[notesDock, "left"], [rightNotesDock, "right"]]) {
    dock.addEventListener("dragover", event => {
      if (!draggedNoteId || !userId) return;
      event.preventDefault(); event.dataTransfer.dropEffect = "move";
    });
    dock.addEventListener("drop", event => {
      if (!draggedNoteId || !userId) return;
      event.preventDefault(); moveNote(draggedNoteId, side);
    });
  }
  function field(form, label, input) {
    const wrapper = el("label", label);
    wrapper.append(input);
    form.append(wrapper);
    return input;
  }
  function input(placeholder, maxLength) { const node = el("input"); node.placeholder = placeholder; node.required = true; if (maxLength) node.maxLength = maxLength; return node; }
  function choice(values, value) {
    const select = el("select");
    values.forEach(([key, label]) => { const option = el("option", label); option.value = key; select.append(option); });
    select.value = value;
    return select;
  }
  function renderCryptoSummary(parent) {
    parent.append(el("div", "Portfolio", "forecast-title"));
    for (const holding of settings.holdings) {
      const row = el("div", undefined, "forecast-day crypto-forecast-row");
      const quote = prices.get(holding.symbol);
      row.append(el("strong", holding.symbol), el("span", holding.amount.toLocaleString("de-DE", { maximumFractionDigits: 8 }), "crypto-quantity"), el("span", quote ? money(quote.price * holding.amount) : "—", "crypto-coin-value"));
      row.setAttribute("aria-label", `${holding.symbol}: ${holding.amount} Coins, ${quote ? money(quote.price * holding.amount) : "Kurs noch nicht verfügbar"}`);
      parent.append(row);
    }
    if (!settings.holdings.length) message(parent, "Coins über das Zahnrad im ＋-Menü hinzufügen.");
    const status = message(parent, cryptoTime ? `Stand ${cryptoTime.toLocaleTimeString("de-DE", {hour:"2-digit",minute:"2-digit"})} · Kraken` : settings.holdings.length ? "Kurse werden geladen …" : "Kraken");
    status.dataset.cryptoStatus = ""; status.setAttribute("aria-live", "polite");
  }
  function renderCrypto(card) {
    const currency = choice([["EUR", "Euro (€)"], ["USD", "US-Dollar ($)"]], settings.currency);
    currency.setAttribute("aria-label", "Portfolio-Währung");
    currency.addEventListener("change", () => changeCurrency(currency.value));
    card.append(currency);
    const total = settings.holdings.reduce((sum, h) => sum + (prices.get(h.symbol)?.price || 0) * h.amount, 0);
    const complete = settings.holdings.length > 0 && settings.holdings.every(h => prices.has(h.symbol));
    card.append(el("div", settings.holdings.length && prices.size ? money(total) : "—", "module-big-value"));
    message(card, complete ? "Gesamtwert deines Portfolios" : "Teilwert · fehlende Kurse werden nicht mitgerechnet");
    for (const holding of settings.holdings) {
      const row = el("div", undefined, "module-price-row");
      const description = el("div");
      description.append(el("strong", holding.symbol));
      message(description, `${holding.amount.toLocaleString("de-DE", { maximumFractionDigits: 12 })} Coins`);
      const quote = prices.get(holding.symbol);
      const value = el("div");
      value.append(el("strong", quote ? money(quote.price * holding.amount) : "Kurs fehlt"));
      if (quote) message(value, `Je Coin ${money(quote.price)}`);
      const remove = button("×", () => { invalidate(); settings.holdings = settings.holdings.filter(h => h !== holding); prices.delete(holding.symbol); save(); render(); });
      remove.setAttribute("aria-label", `${holding.symbol} entfernen`);
      row.append(description, value, remove);
      card.append(row);

    }
    if (!settings.holdings.length) message(card, "Trage einen Coin und deine Menge ein, um dein Portfolio zu berechnen.");
    const form = el("form", undefined, "stacked-form");
    const symbol = field(form, "Coin-Kürzel", input("z. B. BTC, ETH, SOL", 15));
    const amount = field(form, "Deine Menge", input("z. B. 0,025", 30));
    amount.inputMode = "decimal";
    const formStatus = message(form, "Kurse von Kraken. Unterstützt werden Coins mit einem direkten EUR- bzw. USD-Markt.");
    formStatus.setAttribute("aria-live", "polite");
    const submit = el("button", "Coin hinzufügen / Menge ersetzen", "module-button"); submit.type = "submit";
    form.append(submit);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const normalized = symbol.value.trim().toUpperCase().replace(/^XBT$/, "BTC");
      const rawAmount = amount.value.trim();
      const quantity = /^\d+(?:[.,]\d+)?$/.test(rawAmount) ? Number(rawAmount.replace(",", ".")) : NaN;
      if (!/^[A-Z0-9]{1,15}$/.test(normalized) || !Number.isFinite(quantity) || quantity <= 0) { formStatus.textContent = "Bitte Coin-Kürzel und eine positive Menge ohne Tausendertrennzeichen eingeben."; return; }
      if (settings.holdings.length >= 30 && !settings.holdings.some(h => h.symbol === normalized)) { formStatus.textContent = "Maximal 30 Coins sind möglich."; return; }
      submit.disabled = true;
      const current = generation;
      try {
        const markets = await getMarkets();
        if (current !== generation || !userId) return;
        if (!findMarket(markets, normalized)) throw new Error("Für diesen Coin ist bei Kraken kein direkter Markt in deiner gewählten Währung verfügbar.");
        invalidate();
        settings.holdings = settings.holdings.filter(h => h.symbol !== normalized);
        settings.holdings.push({ symbol: normalized, amount: quantity });
        save(); render(); refreshCrypto();
      } catch (error) { if (current === generation) formStatus.textContent = error.message; }
      finally { submit.disabled = false; }
    });
    const details = el("details"); details.append(el("summary", "Coins und Mengen verwalten"), form); details.open = true;
    card.append(details);
    const refresh = button(cryptoBusy ? "Wird aktualisiert …" : "Kurse aktualisieren", refreshCrypto);
    refresh.disabled = cryptoBusy || !settings.holdings.length;
    card.append(refresh);
    const status = message(card, cryptoTime ? `Stand ${cryptoTime.toLocaleString("de-DE")} · Kraken` : "Noch keine Kurse geladen.");
    status.dataset.cryptoStatus = "";
    status.setAttribute("aria-live", "polite");
    const source = el("a", "Kursquelle: Kraken"); source.href = "https://www.kraken.com/prices"; source.target = "_blank"; source.rel = "noopener noreferrer"; card.append(source);
  }
  async function getMarkets() {
    if (!marketsPromise) marketsPromise = json("https://api.kraken.com/0/public/AssetPairs").then(data => {
      if (data.error?.length || !data.result) throw new Error("Coin-Liste ist derzeit nicht verfügbar.");
      return data.result;
    }).catch(error => { marketsPromise = null; throw error; });
    return marketsPromise;
  }
  function findMarket(markets, symbol) {
    const base = { BTC: "XBT", DOGE: "XDG" }[symbol] || symbol;
    return Object.entries(markets).find(([, market]) => market.wsname === `${base}/${settings.currency}`);
  }
  async function refreshCrypto() {
    if (!userId || !settings.enabled.includes("crypto") || !settings.holdings.length || cryptoBusy) return;
    const current = generation;
    cryptoBusy = true; render();
    let errorMessage;
    try {
      const markets = await getMarkets();
      if (current !== generation) return;
      const matches = settings.holdings.map(h => ({ holding: h, market: findMarket(markets, h.symbol) }));
      const supported = matches.filter(m => m.market);
      if (!supported.length) throw new Error("Für die eingetragenen Coins sind keine passenden Kurse verfügbar.");
      const data = await json(`https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(supported.map(m => m.market[1].altname).join(","))}`);
      if (current !== generation) return;
      if (data.error?.length || !data.result) throw new Error("Kraken-Kurse sind derzeit nicht verfügbar.");
      prices.clear();
      for (const item of supported) {
        const price = Number((data.result[item.market[0]] || data.result[item.market[1].altname])?.c?.[0]);
        if (Number.isFinite(price) && price > 0) prices.set(item.holding.symbol, { price });
      }
      if (!prices.size) throw new Error("Die Kursantwort enthielt keine gültigen Preise.");
      cryptoTime = new Date();
    } catch (error) { errorMessage = "Aktualisierung fehlgeschlagen. " + (cryptoTime ? "Letzte Kurse bleiben sichtbar. " : "") + error.message; }
    finally {
      if (current === generation) {
        cryptoBusy = false; render();
        if (errorMessage) { const status = portfolioPanel.querySelector("[data-crypto-status]"); if (status) status.textContent = errorMessage; }
      }
    }
  }
  function validProfile(profile) {
    return typeof profile === "string" && (/^765\d{14}$/.test(profile) || /^https:\/\/steamcommunity\.com\/(?:profiles\/765\d{14}|id\/[A-Za-z0-9_-]{1,80})\/?$/.test(profile));
  }
  function steamAnalystURL(profile) {
    const id = profile?.replace(/^https:\/\/steamcommunity\.com\/profiles\//, "").replace(/\/$/, "");
    return /^765\d{14}$/.test(id || "") ? `https://www.steamanalyst.com/inventory/${id}` : null;
  }
  function renderInventoryHeader() {
    const visible = Boolean(userId && cloudReady && settings.enabled.includes("cs2"));
    inventoryInfo.classList.toggle("hidden", !visible);
    inventoryPanel.classList.toggle("hidden", !visible || !inventoryOpen);
    inventorySettings.setAttribute("aria-expanded", String(visible && inventoryOpen));
    inventoryValues.replaceChildren();
    if (!visible) return;
    if (!settings.profiles.length) {
      inventoryValues.append(button("Account hinzufügen", () => { inventoryOpen = true; render(); }));
      return;
    }
    for (const profile of settings.profiles) {
      const result = inventories.get(profile.profile);
      const value = el("a", "", "portfolio-info inventory-badge");
      const avatar = el("span", "", "inventory-avatar");
      avatar.setAttribute("aria-hidden", "true");
      const fallback = el("span", "●", "inventory-avatar-fallback");
      avatar.append(fallback);
      if (result?.avatarURL && /^https:\/\/avatars(?:\.fastly|\.akamai)?\.steamstatic\.com\/[a-f0-9]+(?:_full|_medium)?\.jpg$/i.test(result.avatarURL)) {
        const image = el("img"); image.src = result.avatarURL; image.alt = ""; image.referrerPolicy = "no-referrer";
        image.addEventListener("load", () => fallback.classList.add("hidden"));
        image.addEventListener("error", () => { image.classList.add("hidden"); fallback.classList.remove("hidden"); });
        avatar.append(image);
      }
      value.append(avatar, el("span", result ? (result.unpricedCount ? "≈ " : "") + inventoryMoney(result.total, result.currency) : "—", "inventory-amount"));
      value.dataset.inventoryProfile = profile.profile;
      const href = steamAnalystURL(profile.profile);
      if (href) { value.href = href; value.target = "_blank"; value.rel = "noopener noreferrer"; }
      else { value.setAttribute("role", "button"); value.setAttribute("tabindex", "0"); }
      const openSettings = event => { if (!href) { event.preventDefault(); inventoryOpen = true; render(); } };
      value.addEventListener("click", openSettings);
      value.addEventListener("keydown", event => { if (!href && (event.key === "Enter" || event.key === " ")) openSettings(event); });
      value.setAttribute("aria-label", `${profile.label}: ${result ? inventoryMoney(result.total, result.currency) : "Wert noch nicht verfügbar"}. ${href ? "Auf SteamAnalyst öffnen" : "SteamID64 in der Profilverwaltung eintragen"}`);
      value.title = `${profile.label} · ${result ? "SteamAnalyst SA Price" : "Wert noch nicht geladen"}`;
      inventoryValues.append(value);
    }
  }

  function inventoryMoney(value, currency = "EUR") { return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(value); }
  function renderCS2(card) {
    message(card, "SA Price direkt von der verlinkten SteamAnalyst-Seite · Euro, umgerechnet zum EZB-Referenzkurs.");
    const available = settings.profiles.filter(p => inventories.has(p.profile));
    const total = available.reduce((sum, p) => sum + inventories.get(p.profile).total, 0);
    card.append(el("div", available.length ? inventoryMoney(total) : "—", "module-big-value"));
    const fullyPriced = available.length === settings.profiles.length && available.length && available.every(p => inventories.get(p.profile).unpricedCount === 0);
    message(card, fullyPriced ? "Geschätzter Gesamtwert aller Profile" : "Teilwert · fehlende Profile oder Item-Preise werden nicht mitgerechnet");
    for (const profile of settings.profiles) {
      const row = el("div", undefined, "module-price-row");
      const description = el("div"); description.append(el("strong", profile.label));
      const link = el("a", "Steam-Profil"); link.href = profile.profile.startsWith("https:") ? profile.profile : `https://steamcommunity.com/profiles/${profile.profile}`; link.target = "_blank"; link.rel = "noopener noreferrer"; description.append(el("br"), link);
      const analystURL = steamAnalystURL(profile.profile);
      if (analystURL) { const analyst = el("a", "SteamAnalyst öffnen"); analyst.href = analystURL; analyst.target = "_blank"; analyst.rel = "noopener noreferrer"; description.append(el("br"), analyst); }
      else message(description, "Für den SteamAnalyst-Direktlink dieses Profil durch seine SteamID64 ersetzen.");
      const result = inventories.get(profile.profile);
      const value = el("div"); value.append(el("strong", result ? inventoryMoney(result.total, result.currency) : "Noch nicht geladen"));
      if (result) message(value, `${result.itemCount} Items · ${result.unpricedCount} ohne Preis · abgerufen ${new Date(result.updatedAt).toLocaleString("de-DE")}`);
      if (result?.sourceUpdated) message(value, `SteamAnalyst-Stand: ${result.sourceUpdated}`);
      const remove = button("×", () => { invalidate(); settings.profiles = settings.profiles.filter(p => p !== profile); inventories.delete(profile.profile); save(); render(); });
      remove.setAttribute("aria-label", `${profile.label} entfernen`);
      row.append(description, value, remove);
      card.append(row);

    }
    const form = el("form", undefined, "stacked-form");
    const label = field(form, "Profilname", input("z. B. Hauptaccount", 40));
    const profile = field(form, "SteamAnalyst-Link, Steam-Profillink oder SteamID64", input("https://www.steamanalyst.com/inventory/…", 160));
    const status = message(form, "Bis zu 10 Profile. Für den SteamAnalyst-Direktlink SteamID64 oder /profiles/-Link eintragen. Das Inventar muss öffentlich sein.");
    const submit = el("button", "Profil hinzufügen", "module-button"); submit.type = "submit"; form.append(submit);
    form.addEventListener("submit", event => {
      event.preventDefault();
      const value = profile.value.trim().replace(/^http:\/\/steamcommunity\.com\//i, "https://steamcommunity.com/").replace(/\/$/, "");
      const normalized = value.replace(/^https:\/\/(?:www\.)?steamanalyst\.com\/inventory\/(765\d{14})$/, "$1").replace(/^https:\/\/steamcommunity\.com\/profiles\//, "");
      if (!validProfile(normalized)) { status.textContent = "Bitte einen SteamAnalyst-Inventarlink, Steam-Profillink oder eine SteamID64 eingeben."; return; }
      if (settings.profiles.length >= 10) { status.textContent = "Maximal 10 Profile sind möglich."; return; }
      if (settings.profiles.some(p => p.profile === normalized)) { status.textContent = "Dieses Profil ist bereits eingetragen."; return; }
      if (!label.value.trim()) { status.textContent = "Bitte einen Profilnamen eingeben."; return; }
      settings.profiles.push({ profile: normalized, label: label.value.trim() }); save(); render();
    });
    const details = el("details"); details.append(el("summary", "Steam-Profile verwalten"), form); details.open = !settings.profiles.length; card.append(details);
    const refresh = button(inventoryBusy ? "Inventare werden geladen …" : "Inventarwerte aktualisieren", refreshInventories);
    refresh.disabled = inventoryBusy || !settings.profiles.length; card.append(refresh);
    const progress = message(card, "Gesamtwert von SteamAnalyst · bis 10 Minuten zwischengespeichert.");
    progress.dataset.inventoryStatus = ""; progress.setAttribute("aria-live", "polite");
    message(card, "Es wird der auf SteamAnalyst angezeigte SA Price übernommen, einschließlich des dortigen Aktualisierungsstands.");
  }
  async function refreshInventories() {
    if (!userId || inventoryBusy || !settings.profiles.length) return;
    const current = generation; inventoryBusy = true; render();
    const errors = [];
    let success = 0;
    try {
      const session = await state.client.auth.getSession();
      if (current !== generation) return;
      if (!session.data?.session?.access_token) throw new Error("Bitte erneut anmelden.");
      for (const profile of settings.profiles.slice()) {
        if (current !== generation) return;
        try {
          const result = await json(`${window.KH7_CONFIG.supabaseUrl}/functions/v1/cs2-inventory`, {
            method: "POST", headers: { "Content-Type": "application/json", apikey: window.KH7_CONFIG.supabasePublishableKey, Authorization: `Bearer ${session.data.session.access_token}` },
            body: JSON.stringify({ profile: profile.profile, currency: "EUR" }),
          });
          if (current !== generation) return;
          if (!Number.isFinite(result.total) || result.total < 0 || !Number.isFinite(result.itemCount) || !Number.isFinite(result.unpricedCount) || !Number.isFinite(Date.parse(result.updatedAt))) throw new Error("Ungültige Inventarantwort.");
          inventories.set(profile.profile, result); success++;
          if (result.warning) errors.push(`${profile.label}: ${result.warning}`);
        } catch (error) { if (current !== generation) return; errors.push(`${profile.label}: ${error.message}${inventories.has(profile.profile) ? " Letzter Wert bleibt sichtbar." : ""}`); }
      }
    } catch (error) { errors.push(error.message); }
    finally {
      if (current === generation) {
        inventoryBusy = false; render();
        const status = inventoryPanel.querySelector("[data-inventory-status]");
        if (status) status.textContent = `${success} Profile aktualisiert.` + (errors.length ? ` ${errors.join(" ")} Fehlende Profile werden nicht mitgerechnet.` : " Quelle: SteamAnalyst SA Price.");
      }
    }
  }

  const picker = el("div", undefined, "modal hidden"); picker.id = "modules-modal"; picker.setAttribute("role", "dialog"); picker.setAttribute("aria-modal", "true"); picker.setAttribute("aria-labelledby", "modules-modal-title");
  const backdrop = button("", closePicker); backdrop.className = "modal-bg"; backdrop.setAttribute("aria-label", "Schließen");
  const content = el("div", undefined, "modal-content");
  const heading = el("div", undefined, "modal-header"); const title = el("span", "Was möchtest du hinzufügen?"); title.id = "modules-modal-title";
  heading.append(title, button("Schließen", closePicker)); content.append(heading);
  const list = el("div", undefined, "module-picker-list");
  function addChoice(title, description, action) {
    const item = button("", action);
    item.className = "add-choice";
    item.append(el("strong", title), el("span", description, "module-muted"));
    list.append(item);
    return item;
  }
  addChoice("Link-Kachel", "Eine Webseite zu deinen Favoriten hinzufügen.", () => {
    closePicker();
    openAddTileModal();
  });
  for (const module of catalog) {
    const item = addChoice(module.title, module.description, () => {
      if (!userId || (module.id === "notes" ? settings.noteItems.length >= 50 : settings.enabled.includes(module.id))) return;
      generation++; cancelRequests(); cryptoBusy = false; inventoryBusy = false;
      if (!settings.enabled.includes(module.id)) settings.enabled.push(module.id);
      if (module.id === "notes") settings.noteItems.push({ id: newNoteId(), content: "", color: "yellow", collapsed: false });
      save(module.id === "notes");
      if (module.id === "crypto") { portfolioOpen = true; cryptoSettingsOpen = true; }
      if (module.id === "cs2") inventoryOpen = true;
      render(); closePicker();
      if (module.id === "crypto") refreshCrypto();
    });
    item.dataset.addModule = module.id;
    if (module.id === "cs2" || module.id === "crypto") {
      const row = el("div", undefined, "add-choice-row");
      list.append(row); row.append(item, module.id === "cs2" ? inventorySettings : cryptoSettings);
    }
  }
  inventorySettings.className = "module-button inventory-picker-settings hidden";
  inventorySettings.textContent = "⚙";
  inventorySettings.title = "CS2-Inventare verwalten";
  content.append(list); message(content, "Notizen, Portfolio-Mengen, Steam-Profile und Moduleinstellungen werden automatisch in deinem Konto gespeichert."); content.append(button("Fertig", closePicker)); picker.append(backdrop, content); document.body.append(picker);
  function closePicker() { picker.classList.add("hidden"); document.getElementById("add-tile-btn").focus(); }
  window.KH7_OPEN_ADD_MENU = () => {
    if (!userId) return;
    if (!cloudReady) { showToast("Dein Dashboard wird noch aus dem Konto geladen."); return; }
    list.querySelectorAll("[data-add-module]").forEach(item => {
      item.disabled = item.dataset.addModule === "notes" ? settings.noteItems.length >= 50 : settings.enabled.includes(item.dataset.addModule);
      const module = catalog.find(value => value.id === item.dataset.addModule);
      item.querySelector("span").textContent = item.disabled ? (module.id === "notes" ? "Maximal 50 Notizen sind möglich" : "Bereits auf deinem Dashboard hinzugefügt") : module.description;
    });
    inventorySettings.classList.toggle("hidden", !settings.enabled.includes("cs2"));
    cryptoSettings.classList.toggle("hidden", !settings.enabled.includes("crypto"));
    picker.classList.remove("hidden"); list.querySelector("button").focus();
  };
  picker.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); closePicker(); }
    if (event.key === "Tab") {
      const focusable = [...content.querySelectorAll("button,input")]; const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  window.addEventListener("kh7-session", event => setSession(event.detail));
  inventorySettings.addEventListener("click", () => {
    closePicker();
    inventoryOpen = true;
    if (inventoryOpen) { portfolioOpen = false; portfolioPanel.classList.add("hidden"); portfolioButton.setAttribute("aria-expanded", "false"); document.getElementById("weather-panel")?.classList.add("hidden"); document.getElementById("weather-info")?.setAttribute("aria-expanded", "false"); }
    inventoryPanel.classList.toggle("hidden", !inventoryOpen); inventorySettings.setAttribute("aria-expanded", String(inventoryOpen));
  });
  cryptoSettings.addEventListener("click", () => {
    closePicker(); cryptoSettingsOpen = true; portfolioOpen = true; inventoryOpen = false;
    document.getElementById("weather-panel")?.classList.add("hidden");
    document.getElementById("weather-info")?.setAttribute("aria-expanded", "false");
    render();
  });
  portfolioButton.addEventListener("click", () => {
    inventoryOpen = false; inventoryPanel.classList.add("hidden"); inventorySettings.setAttribute("aria-expanded", "false");
    portfolioOpen = cryptoSettingsOpen || !portfolioOpen; cryptoSettingsOpen = false;
    render();
    portfolioPanel.classList.toggle("hidden", !portfolioOpen);
    portfolioButton.setAttribute("aria-expanded", String(portfolioOpen));
    if (portfolioOpen) {
      document.getElementById("weather-panel")?.classList.add("hidden");
      document.getElementById("weather-info")?.setAttribute("aria-expanded", "false");
    }
  });
  document.getElementById("weather-info")?.addEventListener("click", () => {
    inventoryOpen = false; inventoryPanel.classList.add("hidden"); inventorySettings.setAttribute("aria-expanded", "false");
    portfolioOpen = false; portfolioPanel.classList.add("hidden"); portfolioButton.setAttribute("aria-expanded", "false");
  });
  document.addEventListener?.("keydown", event => {
    if (event.key === "Escape") { inventoryOpen = false; inventoryPanel.classList.add("hidden"); inventorySettings.setAttribute("aria-expanded", "false"); }
    if (event.key === "Escape") { portfolioOpen = false; portfolioPanel.classList.add("hidden"); portfolioButton.setAttribute("aria-expanded", "false"); }
  });
  function retryNoteSync() {
    if (!userId) return;
    if (!cloudReady) loadCloudNotes();
    else if (noteDirty) writeNote();
  }
  window.addEventListener("online", retryNoteSync);
  window.addEventListener("beforeunload", event => {
    if (!userId || !noteDirty) return;
    writeNote(); event.preventDefault(); event.returnValue = "";
  });
  window.setInterval(() => { if (!document.hidden) retryNoteSync(); }, 30000);
  if (typeof state !== "undefined") setSession({ isAdmin: state.isAdmin, userId: state.user?.id });
  window.setInterval(() => { if (!document.hidden && userId) refreshCrypto(); }, 300000);
  window.setInterval(() => { if (!document.hidden && userId && settings.enabled.includes("cs2") && inventories.size) refreshInventories(); }, 900000);
})();
