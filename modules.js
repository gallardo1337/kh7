"use strict";

// Each module owns its renderer; new modules only need a catalog entry and renderer.
(() => {
  const catalog = [
    { id: "notes", title: "Notizen", description: "Gedanken festhalten. Wird beim Schreiben gespeichert.", render: renderNotes },
    { id: "crypto", title: "Krypto-Portfolio", description: "Eigene Coins und Mengen, aktuelle Kurse und Gesamtwert.", render: renderCrypto },
    { id: "cs2", title: "CS2-Inventare", description: "Mehrere Steam-Profile und ihre geschätzten Inventarwerte.", render: renderCS2 },
  ];
  const panel = document.getElementById("modules-panel");
  const grid = document.getElementById("modules-grid");
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

  function defaults() { return { enabled: [], notes: "", noteColor: "yellow", currency: "EUR", holdings: [], profiles: [], valuation: "steam" }; }
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
    try { localStorage.setItem(storageKey(), JSON.stringify(settings)); return true; }
    catch { showToast("Speichern im Browser nicht möglich. Bitte deine Eingaben sichern.", "error"); return false; }
  }
  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(storageKey()) || "null");
      if (!data || typeof data !== "object") return defaults();
      return {
        enabled: [...new Set(Array.isArray(data.enabled) ? data.enabled.filter(id => catalog.some(item => item.id === id)) : [])],
        notes: typeof data.notes === "string" ? data.notes.slice(0, 20000) : "",
        noteColor: noteColors.some(([key]) => key === data.noteColor) ? data.noteColor : "yellow",
        currency: ["EUR", "USD"].includes(data.currency) ? data.currency : "EUR",
        holdings: Array.isArray(data.holdings) ? data.holdings.filter(h => h && /^[A-Z0-9]{1,15}$/.test(h.symbol) && Number.isFinite(h.amount) && h.amount > 0).slice(0, 30) : [],
        profiles: Array.isArray(data.profiles) ? data.profiles.filter(p => p && typeof p.label === "string" && validProfile(p.profile)).slice(0, 10) : [],
        valuation: data.valuation === "cash" ? "cash" : "steam",
      };
    } catch { showToast("Module konnten nicht aus dem Browser geladen werden.", "error"); return defaults(); }
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
    generation++;
    cancelRequests();
    userId = nextId;
    prices.clear(); inventories.clear(); cryptoTime = null;
    cryptoBusy = false; inventoryBusy = false;
    settings = userId ? load() : defaults();
    picker.classList.add("hidden");
    panel.classList.toggle("hidden", !userId);
    render();
    if (userId && settings.enabled.includes("crypto") && settings.holdings.length) refreshCrypto();
  }
  function render() {
    grid.replaceChildren();
    document.getElementById("modules-empty").classList.toggle("hidden", settings.enabled.length > 0);
    if (!userId) return;
    for (const id of settings.enabled) {
      const module = catalog.find(item => item.id === id);
      const card = el("article", undefined, "module-card");
      card.dataset.module = id;
      const heading = el("div", undefined, "module-heading");
      heading.append(el("h3", module.title), button("Ausblenden", () => {
        generation++; cancelRequests(); cryptoBusy = false; inventoryBusy = false;
        settings.enabled = settings.enabled.filter(value => value !== id);
        save(); render();
      }));
      card.append(heading);
      module.render(card);
      grid.append(card);
    }
  }
  function renderNotes(card) {
    card.classList.add("sticky-note");
    card.dataset.noteColor = settings.noteColor;
    const palette = el("div", undefined, "note-palette");
    palette.setAttribute("role", "group");
    palette.setAttribute("aria-label", "Notizfarbe");
    for (const [color, name] of noteColors) {
      const swatch = button("", () => {
        settings.noteColor = color;
        card.dataset.noteColor = color;
        palette.querySelectorAll("button").forEach(item => item.setAttribute("aria-pressed", String(item.dataset.color === color)));
        save();
      });
      swatch.className = "note-swatch";
      swatch.dataset.color = color;
      swatch.title = name;
      swatch.setAttribute("aria-label", `Notizfarbe ${name}`);
      swatch.setAttribute("aria-pressed", String(settings.noteColor === color));
      palette.append(swatch);
    }
    const input = el("textarea");
    input.setAttribute("aria-label", "Meine Notizen");
    input.placeholder = "Was möchtest du festhalten?";
    input.maxLength = 20000;
    input.value = settings.notes;
    const status = el("p", "Nur in diesem Browser gespeichert.", "module-muted");
    status.setAttribute("aria-live", "polite");
    input.addEventListener("input", () => {
      settings.notes = input.value;
      status.textContent = save() ? "Gespeichert · nur in diesem Browser" : "Nicht gespeichert – bitte Text sichern.";
    });
    card.append(palette, input, status);
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
    const details = el("details"); details.append(el("summary", "Coins und Mengen verwalten"), form); details.open = !settings.holdings.length;
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
        if (errorMessage) { const status = grid.querySelector("[data-crypto-status]"); if (status) status.textContent = errorMessage; }
      }
    }
  }
  function validProfile(profile) {
    return typeof profile === "string" && (/^765\d{14}$/.test(profile) || /^https:\/\/steamcommunity\.com\/(?:profiles\/765\d{14}|id\/[A-Za-z0-9_-]{1,80})\/?$/.test(profile));
  }
  function renderCS2(card) {
    const currency = choice([["EUR", "Euro (€)"], ["USD", "US-Dollar ($)"]], settings.currency);
    currency.setAttribute("aria-label", "Inventar-Währung");
    currency.addEventListener("change", () => changeCurrency(currency.value));
    card.append(currency);
    const valuation = choice([["steam", "Steam-Marktpreise"], ["cash", "Drittanbieter-Marktpreise"]], settings.valuation);
    valuation.setAttribute("aria-label", "CS2-Preisquelle");
    valuation.addEventListener("change", () => { generation++; cancelRequests(); inventoryBusy = false; cryptoBusy = false; settings.valuation = valuation.value; inventories.clear(); save(); render(); });
    card.append(valuation);
    const available = settings.profiles.filter(p => inventories.has(p.profile));
    const total = available.reduce((sum, p) => sum + inventories.get(p.profile).total, 0);
    card.append(el("div", available.length ? money(total) : "—", "module-big-value"));
    const fullyPriced = available.length === settings.profiles.length && available.length && available.every(p => inventories.get(p.profile).unpricedCount === 0);
    message(card, fullyPriced ? "Geschätzter Gesamtwert aller Profile" : "Teilwert · fehlende Profile oder Item-Preise werden nicht mitgerechnet");
    for (const profile of settings.profiles) {
      const row = el("div", undefined, "module-price-row");
      const description = el("div"); description.append(el("strong", profile.label));
      const link = el("a", "Steam-Profil"); link.href = profile.profile.startsWith("https:") ? profile.profile : `https://steamcommunity.com/profiles/${profile.profile}`; link.target = "_blank"; link.rel = "noopener noreferrer"; description.append(el("br"), link);
      const result = inventories.get(profile.profile);
      const value = el("div"); value.append(el("strong", result ? money(result.total) : "Noch nicht geladen"));
      if (result) message(value, `${result.itemCount} Items · ${result.unpricedCount} ohne Preis · abgerufen ${new Date(result.updatedAt).toLocaleString("de-DE")}`);
      const remove = button("×", () => { invalidate(); settings.profiles = settings.profiles.filter(p => p !== profile); inventories.delete(profile.profile); save(); render(); });
      remove.setAttribute("aria-label", `${profile.label} entfernen`);
      row.append(description, value, remove);
      card.append(row);
    }
    const form = el("form", undefined, "stacked-form");
    const label = field(form, "Profilname", input("z. B. Hauptaccount", 40));
    const profile = field(form, "Steam-Profillink oder SteamID64", input("https://steamcommunity.com/id/…", 160));
    const status = message(form, "Bis zu 10 Profile. Das Inventar muss öffentlich sein.");
    const submit = el("button", "Profil hinzufügen", "module-button"); submit.type = "submit"; form.append(submit);
    form.addEventListener("submit", event => {
      event.preventDefault();
      const value = profile.value.trim().replace(/\/$/, "");
      const normalized = value.replace(/^https:\/\/steamcommunity\.com\/profiles\//, "");
      if (!validProfile(normalized)) { status.textContent = "Bitte einen Steam-Profillink (https://steamcommunity.com/…) oder eine SteamID64 eingeben."; return; }
      if (settings.profiles.length >= 10) { status.textContent = "Maximal 10 Profile sind möglich."; return; }
      if (settings.profiles.some(p => p.profile === normalized)) { status.textContent = "Dieses Profil ist bereits eingetragen."; return; }
      if (!label.value.trim()) { status.textContent = "Bitte einen Profilnamen eingeben."; return; }
      settings.profiles.push({ profile: normalized, label: label.value.trim() }); save(); render();
    });
    const details = el("details"); details.append(el("summary", "Steam-Profile verwalten"), form); details.open = !settings.profiles.length; card.append(details);
    const refresh = button(inventoryBusy ? "Inventare werden geladen …" : "Inventarwerte aktualisieren", refreshInventories);
    refresh.disabled = inventoryBusy || !settings.profiles.length; card.append(refresh);
    const progress = message(card, "Automatische Bewertung benötigt einen auf dem Server eingerichteten Preis- und Inventardienst.");
    progress.dataset.inventoryStatus = ""; progress.setAttribute("aria-live", "polite");
    message(card, "Schätzung der sichtbaren Inventargegenstände ohne Gebühren und individuelle Sticker-Aufpreise. Items ohne Preis werden nicht mitgerechnet.");
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
          const result = await json("api/inventory.php", {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.data.session.access_token}` },
            body: JSON.stringify({ profile: profile.profile, currency: settings.currency, valuation: settings.valuation }),
          });
          if (current !== generation) return;
          if (!Number.isFinite(result.total) || result.total < 0 || !Number.isFinite(result.itemCount) || !Number.isFinite(result.unpricedCount) || !Number.isFinite(Date.parse(result.updatedAt))) throw new Error("Ungültige Inventarantwort.");
          inventories.set(profile.profile, result); success++;
        } catch (error) { if (current !== generation) return; inventories.delete(profile.profile); errors.push(`${profile.label}: ${error.message}`); }
      }
    } catch (error) { errors.push(error.message); }
    finally {
      if (current === generation) {
        inventoryBusy = false; render();
        const status = grid.querySelector("[data-inventory-status]");
        if (status) status.textContent = `${success} Profile aktualisiert.` + (errors.length ? ` ${errors.join(" ")} Fehlende Profile werden nicht mitgerechnet.` : " Quelle: SteamWebAPI.");
      }
    }
  }

  const picker = el("div", undefined, "modal hidden"); picker.id = "modules-modal"; picker.setAttribute("role", "dialog"); picker.setAttribute("aria-modal", "true"); picker.setAttribute("aria-labelledby", "modules-modal-title");
  const backdrop = button("", closePicker); backdrop.className = "modal-bg"; backdrop.setAttribute("aria-label", "Schließen");
  const content = el("div", undefined, "modal-content");
  const heading = el("div", undefined, "modal-header"); const title = el("span", "Module hinzufügen"); title.id = "modules-modal-title";
  heading.append(title, button("Schließen", closePicker)); content.append(heading);
  const list = el("div", undefined, "module-picker-list");
  for (const module of catalog) {
    const item = el("div", undefined, "module-picker-item"); const label = el("label"); const check = el("input"); check.type = "checkbox"; check.dataset.module = module.id;
    check.addEventListener("change", () => {
      generation++; cancelRequests(); cryptoBusy = false; inventoryBusy = false;
      settings.enabled = check.checked ? [...new Set([...settings.enabled, module.id])] : settings.enabled.filter(id => id !== module.id);
      save(); render();
      if (check.checked && module.id === "crypto") refreshCrypto();
    });
    label.append(check, el("strong", module.title)); item.append(label); message(item, module.description); list.append(item);
  }
  content.append(list); message(content, "Eingaben bleiben beim Ausblenden erhalten. Module und Inhalte werden nur in diesem Browser gespeichert."); content.append(button("Fertig", closePicker)); picker.append(backdrop, content); document.body.append(picker);
  function closePicker() { picker.classList.add("hidden"); document.getElementById("modules-manage").focus(); }
  document.getElementById("modules-manage").addEventListener("click", () => {
    list.querySelectorAll("input").forEach(check => { check.checked = settings.enabled.includes(check.dataset.module); });
    picker.classList.remove("hidden"); list.querySelector("input").focus();
  });
  picker.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); closePicker(); }
    if (event.key === "Tab") {
      const focusable = [...content.querySelectorAll("button,input")]; const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  window.addEventListener("kh7-session", event => setSession(event.detail));
  if (typeof state !== "undefined") setSession({ isAdmin: state.isAdmin, userId: state.user?.id });
  window.setInterval(() => { if (!document.hidden && userId) refreshCrypto(); }, 300000);
})();
