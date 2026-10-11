// API keys stay in Supabase Secrets. No upstream response body is returned to clients.
const PUBLISHABLE = "sb_publishable_iTWeyhfns_LHBF7KGrQCRw_cTFi1Dth";
const ORIGIN = "https://gallardo1337.github.io";
const resultCache = new Map();
class InventoryError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}
async function readJSON(url, headers = {}, options = {}) {
  const response = await fetch(url, { ...options, headers, redirect: "error", signal: AbortSignal.timeout(12000) });
  let data;
  try { data = await response.json(); } catch { throw new InventoryError("Die Datenquelle ist momentan nicht verfügbar."); }
  return { response, data };
}
async function inventoryHandler(req) {
  const cors = { "Access-Control-Allow-Origin": ORIGIN, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Cache-Control": "no-store", "Content-Type": "application/json", "Vary": "Origin" };
  const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: cors });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply({ error: "Bitte POST verwenden." }, 405);
  try {
    const deadline = Date.now() + 30000;
    const authorization = req.headers.get("Authorization") || "";
    if (!/^Bearer [A-Za-z0-9_.-]{20,8192}$/.test(authorization)) return reply({ error: "Bitte anmelden." }, 401);
    const base = Deno.env.get("SUPABASE_URL");
    const userHeaders = { apikey: PUBLISHABLE, Authorization: authorization, "Content-Type": "application/json" };
    const user = await readJSON(`${base}/auth/v1/user`, userHeaders);
    if (!user.response.ok || !/^[a-f0-9-]{36}$/.test(user.data.id || "")) return reply({ error: "Bitte erneut anmelden." }, 401);
    const allowed = await readJSON(`${base}/rest/v1/rpc/inventory_authorized`, userHeaders, { method: "POST", body: "{}" });
    if (!allowed.response.ok || allowed.data !== true) return reply({ error: "Keine aktive Admin-Sitzung." }, 403);
    const bodyText = await req.text();
    if (bodyText.length > 2000000) return reply({ error: "Anfrage zu groß." }, 413);
    let body; try { body = JSON.parse(bodyText); } catch { return reply({ error: "Ungültige Anfrage." }, 400); }
    if (!body || typeof body !== "object") return reply({ error: "Ungültige Anfrage." }, 400);
    const steamId = typeof body.profile === "string" ? body.profile.replace(/^https:\/\/steamcommunity\.com\/profiles\//, "").replace(/\/$/, "") : "";
    if (!/^765\d{14}$/.test(steamId)) return reply({ error: "Bitte eine SteamID64 oder einen SteamAnalyst-Inventarlink eintragen." }, 400);
    const currency = body.currency || "EUR";
    if (!["EUR", "USD"].includes(currency)) return reply({ error: "Ungültige Währung." }, 400);
    const imported = body.inventory;
    if (imported && ((imported.success !== 1 && imported.success !== true) || !Array.isArray(imported.assets) || !Array.isArray(imported.descriptions) || imported.assets.length > 5000 || imported.descriptions.length > 5000 || imported.more_items)) return reply({ error: "Die Datei muss ein vollständiges Steam-Inventar enthalten. Teilinventare werden nicht bewertet." }, 400);
    const key = Deno.env.get("STEAMANALYST_API_KEY");
    if (!key) return reply({ error: "SteamAnalyst-Key fehlt. In Supabase unter Edge Functions → Secrets STEAMANALYST_API_KEY eintragen." }, 503);
    const cacheKey = `${user.data.id}:${steamId}:${currency}:${imported ? "import" : "live"}`;
    const cached = resultCache.get(cacheKey);
    if (!imported && cached && cached.expires > Date.now()) return reply(cached.value);
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default;
    if (!serviceKey) throw new InventoryError("Server-Konfiguration unvollständig.", 503);
    const serverHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
    const rpc = async (name, body = {}) => {
      const result = await readJSON(`${base}/rest/v1/rpc/${name}`, serverHeaders, { method: "POST", body: JSON.stringify(body) });
      if (!result.response.ok) throw new InventoryError("Server-Speicherung ist momentan nicht verfügbar.", 503);
      return result.data;
    };
    if (!await rpc("claim_inventory_refresh", { p_user_id: user.data.id, p_steam_id: steamId })) return reply({ error: "Bitte 30 Sekunden bis zum nächsten Inventarabruf warten." }, 429);
    let rate = 1, rateDate = null;
    if (currency === "EUR") {
      const fx = await readJSON("https://api.frankfurter.dev/v2/providers/ecb/rate/usd/eur");
      if (!fx.response.ok || !Number.isFinite(fx.data.rate) || fx.data.rate <= 0) throw new InventoryError("Euro-Umrechnung momentan nicht verfügbar. Bitte USD wählen.");
      rate = fx.data.rate; rateDate = fx.data.date;
    }
    const counts = new Map(), seen = new Set(), cursors = new Set();
    let cursor = "", itemCount = 0;
    for (let page = 0; page < 10; page++) {
      if (Date.now() > deadline) throw new InventoryError("Steam-Inventar lädt zu langsam. Bitte erneut versuchen.");
      const url = `https://steamcommunity.com/inventory/${steamId}/730/2?l=english&count=5000${cursor ? `&start_assetid=${cursor}` : ""}`;
      const inventory = imported ? { response: { ok: true, status: 200 }, data: imported } : await readJSON(url);
      if (inventory.response.status === 429) throw new InventoryError("Steam begrenzt Inventarabfragen (HTTP 429). Bitte einige Minuten warten und erneut aktualisieren.", 429);
      const steamError = typeof inventory.data?.Error === "string" ? inventory.data.Error : typeof inventory.data?.error === "string" ? inventory.data.error : "";
      if (/private/i.test(steamError)) throw new InventoryError("Steam meldet ein privates Inventar. In Steam unter Profil bearbeiten → Privatsphäre-Einstellungen das Inventar auf Öffentlich stellen.", 403);
      if (inventory.response.status === 403) throw new InventoryError("Steam verweigert den Serverabruf (HTTP 403). Das kann eine Steam-Sperre des Serverzugriffs sein; ein privates Inventar ist damit nicht bestätigt.", 502);
      if (!inventory.response.ok) throw new InventoryError(`Steam-Inventarabruf fehlgeschlagen (HTTP ${inventory.response.status}). Bitte später erneut versuchen.`);
      if (inventory.data?.success !== 1 && inventory.data?.success !== true) throw new InventoryError("Steam liefert keine gültige Inventarantwort (HTTP 200). Bitte Inventar-Öffentlichkeit und SteamID prüfen.");
      const { assets = [], descriptions = [] } = inventory.data;
      if (!Array.isArray(assets) || !Array.isArray(descriptions)) throw new InventoryError("Ungültige Steam-Inventarantwort.");
      const names = new Map(descriptions.map(item => [`${item.classid}:${item.instanceid}`, item.market_hash_name]));
      for (const asset of assets) {
        if (!/^\d+$/.test(asset.assetid || "")) throw new InventoryError("Ungültige Steam-Inventarantwort.");
        if (seen.has(asset.assetid)) continue;
        seen.add(asset.assetid);
        const quantity = Number(asset.amount ?? 1);
        if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000) throw new InventoryError("Ungültige Item-Menge.");
        const name = names.get(`${asset.classid}:${asset.instanceid}`) || "";
        counts.set(name, (counts.get(name) || 0) + quantity); itemCount += quantity;
      }
      if (!inventory.data.more_items) break;
      cursor = String(inventory.data.last_assetid || "");
      if (!/^\d{1,30}$/.test(cursor) || cursors.has(cursor) || page === 9) throw new InventoryError("Das Inventar konnte nicht vollständig geladen werden.");
      cursors.add(cursor);
    }
    let totalUSD = 0, unpricedCount = 0, requests = 0, limitReached = false;
    const cachedPrices = await rpc("inventory_cached_prices", { p_names: [...counts.keys()].filter(Boolean) });
    if (!Array.isArray(cachedPrices)) throw new InventoryError("Ungültiger Preis-Zwischenspeicher.");
    const cache = new Map(cachedPrices.map(entry => [entry.market_name, entry.price_usd]));
    for (const [name, quantity] of counts) {
      if (!name) { unpricedCount += quantity; continue; }
      let price = cache.get(name);
      if (price === undefined) {
        if (limitReached || requests >= 20 || Date.now() > deadline || !await rpc("reserve_inventory_price_request")) { unpricedCount += quantity; limitReached = true; continue; }
        requests++;
        const quote = await readJSON(`https://api.steamanalyst.com/v1/prices?market_name=${encodeURIComponent(name)}`, { Authorization: `Bearer ${key}` });
        if (quote.response.status === 401 || quote.response.status === 403) throw new InventoryError("SteamAnalyst-Key ungültig oder für Preisabfragen nicht freigeschaltet.", 503);
        if (quote.response.status === 429) { unpricedCount += quantity; limitReached = true; continue; }
        if (!quote.response.ok && quote.response.status !== 404) throw new InventoryError("SteamAnalyst ist momentan nicht erreichbar.");
        price = quote.response.ok && quote.data.success === true && Number.isFinite(quote.data.data?.price) && quote.data.data.price >= 0 ? quote.data.data.price : null;
        const saved = await readJSON(`${base}/rest/v1/inventory_price_cache?on_conflict=market_name`, { ...serverHeaders, Prefer: "resolution=merge-duplicates,return=representation" }, { method: "POST", body: JSON.stringify({ market_name: name, price_usd: price, fetched_at: new Date().toISOString() }) });
        if (!saved.response.ok) throw new InventoryError("Preis-Zwischenspeicher konnte nicht gespeichert werden.");
      }
      if (price === null || !Number.isFinite(Number(price))) unpricedCount += quantity;
      else totalUSD += Number(price) * quantity;
    }
    if (itemCount > 0 && unpricedCount === itemCount) throw new InventoryError(limitReached ? "Preisabfrage-Limit erreicht. Noch kein Inventarwert verfügbar; später erneut versuchen." : "Für dieses Inventar sind momentan keine Preise verfügbar.", limitReached ? 429 : 502);
    const result = { total: Math.round(totalUSD * rate * 100) / 100, itemCount, unpricedCount, currency, source: "SteamAnalyst", inventorySource: imported ? "import" : "steam", valuation: "fair", updatedAt: new Date().toISOString(), priceCacheHours: 24, rateDate, warning: [imported ? "Importierte Inventardatei bewertet; entspricht dem Stand der Datei, nicht einem Live-Abruf." : "", limitReached ? "Abfrage-Limit erreicht. Fehlende Preise werden nicht mitgerechnet; später erneut aktualisieren." : ""].filter(Boolean).join(" ") || null };
    if (resultCache.size > 100) resultCache.clear();
    resultCache.set(cacheKey, { value: result, expires: Date.now() + (limitReached ? 30000 : 900000) });
    return reply(result);
  } catch (error) {
    return reply({ error: error instanceof InventoryError ? error.message : "Inventarabruf fehlgeschlagen. Bitte später erneut versuchen." }, error instanceof InventoryError ? error.status : 502);
  }
}
Deno.serve(inventoryHandler);
