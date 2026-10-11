const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync('supabase/functions/cs2-inventory/index.ts', 'utf8');
const id = '76561197973118581';
function setup(options = {}) {
  let handler, quoteCalls = 0, secretReads = 0;
  const auth = 'Bearer ' + 'a'.repeat(30);
  const context = { Request, Response, AbortSignal, URL, fetch: async (url, opts = {}) => {
    let data;
    if (url.endsWith('/auth/v1/user')) data = { id: '11111111-1111-1111-1111-111111111111' };
    else if (url.endsWith('/rpc/inventory_authorized')) data = !options.denied;
    else if (url.endsWith('/rpc/claim_inventory_refresh')) data = !options.throttle;
    else if (url.endsWith('/rpc/reserve_inventory_price_request')) data = !options.budget;
    else if (url.endsWith('/rpc/inventory_cached_prices')) data = options.cached || [];
    else if (url.includes('frankfurter')) data = { rate: 0.9, date: '2026-10-09' };
    else if (url.includes('steamcommunity.com/inventory/')) {
      if (options.steamStatus) return Response.json(options.private ? { success: false, Error: 'This profile is private.' } : {}, { status: options.steamStatus });
      const count = options.many ? 25 : 2;
      data = { success: 1, assets: Array.from({ length: count }, (_, n) => ({ assetid: String(n+1), classid: String(n+1), instanceid: '0', amount: n === 0 ? '2' : '1' })), descriptions: Array.from({ length: count }, (_, n) => ({ classid: String(n+1), instanceid: '0', market_hash_name: 'Item '+n })) };
      if (options.pagination) { data.more_items = true; data.last_assetid = '1'; }
      if (options.booleanSuccess) data.success = true;
    } else if (url.includes('api.steamanalyst.com')) {
      quoteCalls++; assert.equal(opts.headers.Authorization, 'Bearer secret-test');
      if (options.rateLimit) return Response.json({}, { status: 429 });
      data = { success: true, data: { price: 10 } };
    } else if (url.includes('/inventory_price_cache?')) data = [];
    else throw Error('Unexpected request');
    return Response.json(data);
  }, Deno: { serve: fn => handler = fn, env: { get: name => {
    if (name === 'STEAMANALYST_API_KEY') { secretReads++; return options.missing ? undefined : 'secret-test'; }
    return name === 'SUPABASE_URL' ? 'https://test.supabase.co' : 'service-test';
  } } } };
  vm.createContext(context); vm.runInContext(code, context);
  return { call: (body = { profile: id, currency: 'USD' }, token = auth, method = 'POST') => handler(new Request('https://example.test', { method, headers: token ? { Authorization: token } : {}, body: method === 'POST' ? JSON.stringify(body) : undefined })), quotes: () => quoteCalls, reads: () => secretReads };
}
(async () => {
  const anon = setup(); assert.equal((await anon.call({}, '', 'POST')).status, 401); assert.equal(anon.reads(), 0);
  assert.equal((await anon.call({}, '', 'OPTIONS')).status, 204);
  const denied = setup({ denied: true }); assert.equal((await denied.call()).status, 403); assert.equal(denied.reads(), 0);
  const missing = setup({ missing: true }); assert.equal((await missing.call()).status, 503); assert.equal(missing.quotes(), 0);
  const unsafe = setup(); assert.equal((await unsafe.call({ profile: 'https://evil.test', currency: 'USD' })).status, 400);
  const good = setup(); const response = await good.call(); const value = await response.json();
  assert.equal(response.status, 200); assert.equal(value.total, 30); assert.equal(value.itemCount, 3); assert.equal(value.unpricedCount, 0);
  assert.equal(value.source, 'SteamAnalyst'); assert(!JSON.stringify(value).includes('secret-test'));
  await good.call(); assert.equal(good.quotes(), 2);
  const euro = await (await setup().call({ profile: id, currency: 'EUR' })).json(); assert.equal(euro.total, 27);
  const cache = setup({ cached: [{ market_name: 'Item 0', price_usd: '5' }, { market_name: 'Item 1', price_usd: null }] });
  const cachedValue = await (await cache.call()).json(); assert.equal(cachedValue.total, 10); assert.equal(cachedValue.unpricedCount, 1); assert.equal(cache.quotes(), 0);
  const many = setup({ many: true }); const partial = await (await many.call()).json(); assert.equal(many.quotes(), 20); assert.equal(partial.unpricedCount, 5); assert.match(partial.warning, /Limit/);
  const exhausted = setup({ budget: true }); assert.equal((await exhausted.call()).status, 429); assert.equal(exhausted.quotes(), 0);
  const providerLimit = setup({ many: true, rateLimit: true, cached: [{ market_name: 'Item 0', price_usd: 5 }] });
  const limited = await (await providerLimit.call()).json(); assert.equal(providerLimit.quotes(), 1); assert.equal(limited.unpricedCount, 24); assert.equal(limited.total, 10);
  assert.equal((await setup({ throttle: true }).call()).status, 429);
  assert.equal((await setup({ pagination: true }).call()).status, 502);
  assert.equal((await setup({ booleanSuccess: true }).call()).status, 200);
  const rateLimited = await setup({ steamStatus: 429 }).call(); assert.equal(rateLimited.status, 429); assert.match((await rateLimited.json()).error, /HTTP 429/);
  const blocked = await setup({ steamStatus: 403 }).call(); assert.match((await blocked.json()).error, /nicht bestätigt/);
  const privateInventory = await setup({ steamStatus: 403, private: true }).call(); assert.equal(privateInventory.status, 403); assert.match((await privateInventory.json()).error, /privates Inventar/);
  console.log('PASS: edge auth, missing secret, validation, quantities, currency, cache, budgets, provider limits, pagination.');
})().catch(error => { console.error(error); process.exitCode = 1; });
