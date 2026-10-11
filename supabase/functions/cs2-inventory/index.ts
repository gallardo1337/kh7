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
    const authorization = req.headers.get("Authorization") || "";
    if (!/^Bearer [A-Za-z0-9_.-]{20,8192}$/.test(authorization)) return reply({ error: "Bitte anmelden." }, 401);
    const base = Deno.env.get("SUPABASE_URL");
    const userHeaders = { apikey: PUBLISHABLE, Authorization: authorization, "Content-Type": "application/json" };
    const user = await readJSON(`${base}/auth/v1/user`, userHeaders);
    if (!user.response.ok || !/^[a-f0-9-]{36}$/.test(user.data.id || "")) return reply({ error: "Bitte erneut anmelden." }, 401);
    const allowed = await readJSON(`${base}/rest/v1/rpc/inventory_authorized`, userHeaders, { method: "POST", body: "{}" });
    if (!allowed.response.ok || allowed.data !== true) return reply({ error: "Keine aktive Admin-Sitzung." }, 403);
    const bodyText = await req.text();
    if (bodyText.length > 2048) return reply({ error: "Anfrage zu groß." }, 413);
    let body; try { body = JSON.parse(bodyText); } catch { return reply({ error: "Ungültige Anfrage." }, 400); }
    if (!body || typeof body !== "object") return reply({ error: "Ungültige Anfrage." }, 400);
    const steamId = typeof body.profile === "string" ? body.profile.replace(/^https:\/\/steamcommunity\.com\/profiles\//, "").replace(/\/$/, "") : "";
    if (!/^765\d{14}$/.test(steamId)) return reply({ error: "Bitte eine SteamID64 oder einen SteamAnalyst-Inventarlink eintragen." }, 400);
    const currency = body.currency || "EUR";
    if (!["EUR", "USD"].includes(currency)) return reply({ error: "Ungültige Währung." }, 400);
    const cacheKey = `${steamId}:${currency}`;
    const cached = resultCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return reply(cached.value);
    const url = `https://www.steamanalyst.com/inventory/${steamId}`;
    const page = await fetch(url, { headers: { Accept: "text/html", "User-Agent": "KH7-Dashboard/2.3" }, redirect: "error", signal: AbortSignal.timeout(25000) });
    if (page.status === 429) throw new InventoryError("SteamAnalyst begrenzt Seitenabrufe. Bitte später erneut versuchen.", 429);
    if (!page.ok) throw new InventoryError(`SteamAnalyst-Seite nicht verfügbar (HTTP ${page.status}).`);
    const html = await page.text();
    if (html.length > 8000000) throw new InventoryError("SteamAnalyst-Antwort ist zu groß.");
    const parsed = parseSAValue(html);
    if (!parsed) throw new InventoryError("SA Price konnte auf der SteamAnalyst-Seite nicht erkannt werden. Der Anbieter liefert möglicherweise eine Schutzseite oder lädt den Wert nur im Browser.");
    let rate = 1, rateDate = null;
    if (currency === "EUR") {
      const fx = await readJSON("https://api.frankfurter.dev/v2/providers/ecb/rate/usd/eur");
      if (!fx.response.ok || !Number.isFinite(fx.data.rate) || fx.data.rate <= 0) throw new InventoryError("Euro-Wechselkurs momentan nicht verfügbar. Bitte später erneut versuchen.");
      rate = fx.data.rate; rateDate = fx.data.date;
    }
    const result = { total: Math.round(parsed.total * rate * 100) / 100, totalUSD: parsed.total, avatarURL: parsed.avatarURL, rateDate, itemCount: parsed.itemCount, unpricedCount: 0, currency, source: "SteamAnalyst SA Price", updatedAt: new Date().toISOString(), sourceUpdated: parsed.sourceUpdated, sourceURL: url };
    if (resultCache.size > 100) resultCache.clear();
    resultCache.set(cacheKey, { value: result, expires: Date.now() + 600000 });
    return reply(result);
  } catch (error) {
    return reply({ error: error instanceof InventoryError ? error.message : "SteamAnalyst-Abruf fehlgeschlagen. Bitte später erneut versuchen." }, error instanceof InventoryError ? error.status : 502);
  }
}
function parseSAValue(html) {
  // Match the SA Price block only, never CS.Money, friends, or premium-copy estimates.
  html = html.replace(/<!--.*?-->/g, "");
  const marker = /<div\b[^>]*class=["'][^"']*\bvalue-item\s+primary\b[^"']*["'][^>]*>/i.exec(html);
  const primary = marker ? [marker[0], html.slice(marker.index, marker.index + 8000)] : null;
  if (!primary || !/SA\s+Price/i.test(primary[1])) return null;
  const amount = primary[1].match(/<span\b[^>]*class=["'][^"']*\bvalue-amount\b[^"']*["'][^>]*>\s*(?:<!--.*?-->\s*)*\$([0-9,]+\.[0-9]{2})/i);
  if (!amount) return null;
  const total = Number(amount[1].replaceAll(",", ""));
  if (!Number.isFinite(total) || total < 0) return null;
  const text = html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const items = text.match(/\b([0-9,]+)\s+items\b/i);
  const updated = text.match(/Updated\s+([^<]{1,60}?)(?=Market value|Sell now|Insights|Alerts|$)/i);
  const avatarTag = html.match(/<img\b[^>]*class=["'][^"']*\bprofile-avatar\b[^"']*["'][^>]*>/i);
  const avatarSrc = avatarTag?.[0].match(/\bsrc=["']([^"']+)["']/i)?.[1];
  const avatarURL = avatarSrc && /^https:\/\/avatars(?:\.fastly|\.akamai)?\.steamstatic\.com\/[a-f0-9]+(?:_full|_medium)?\.jpg$/i.test(avatarSrc) ? avatarSrc : null;
  return { total, avatarURL, itemCount: items ? Number(items[1].replaceAll(",", "")) : 0, sourceUpdated: updated ? updated[1].trim() : null };
}
Deno.serve(inventoryHandler);
