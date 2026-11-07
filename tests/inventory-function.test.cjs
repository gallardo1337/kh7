const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync('supabase/functions/cs2-inventory/index.ts', 'utf8');
const id = '76561197973118581';
const html = '<img class="profile-avatar" src="https://avatars.steamstatic.com/abcd_full.jpg"><div class="value-item primary"><div class="value-details"><span class="value-label">SA Price</span><span class="value-amount">$<!-- -->10,832.52</span><span>≈ $10,932.69 for your copies</span></div></div><a class="value-item secondary">CS.Money $10,371.01</a><div>884 items</div><div>Updated 2 hours ago</div><div>Market value</div>';
function setup(options = {}) {
 let handler, pageCalls = 0;
 const context = { Request, Response, AbortSignal, fetch: async url => {
  if (url.endsWith('/auth/v1/user')) return Response.json({ id: '11111111-1111-1111-1111-111111111111' });
  if (url.endsWith('/rpc/inventory_authorized')) return Response.json(!options.denied);
  if(url.includes('frankfurter')) return Response.json({rate:0.9,date:'2026-10-09'});
  assert.equal(url, `https://www.steamanalyst.com/inventory/${id}`); pageCalls++;
  return new Response(options.html ?? html, { status: options.status ?? 200 });
 }, Deno: { serve: fn => handler = fn, env: { get: name => { assert.equal(name, 'SUPABASE_URL'); return 'https://test.supabase.co'; } } } };
 vm.createContext(context); vm.runInContext(code, context);
 return { handle: handler, parse: context.parseSAValue, count: () => pageCalls, call: (profile = id, token = 'Bearer '+ 'a'.repeat(30)) => handler(new Request('https://example.test', { method: 'POST', headers: token ? { Authorization: token } : {}, body: JSON.stringify({ profile, currency:'EUR' }) })) };
}
(async () => {
 for (const origin of ['https://gallardo1337.io','https://www.gallardo1337.io','https://gallardo1337.github.io']) {
  const app = setup();
  const preflight = await app.handle(new Request('https://example.test', {method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,apikey,content-type'}}));
  assert.equal(preflight.status,204); assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);
  for (const header of ['authorization','apikey','content-type']) assert(preflight.headers.get('Access-Control-Allow-Headers').includes(header));
  const unauthorized = await app.handle(new Request('https://example.test',{method:'POST',headers:{Origin:origin},body:'{}'}));
  assert.equal(unauthorized.status,401); assert.equal(unauthorized.headers.get('Access-Control-Allow-Origin'),origin); assert.equal(app.count(),0);
  const success = await app.handle(new Request('https://example.test',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+'a'.repeat(30)},body:JSON.stringify({profile:id,currency:'EUR'})}));
  assert.equal(success.status,200); assert.equal(success.headers.get('Access-Control-Allow-Origin'),origin);
 }
 for (const origin of ['https://evil.test','https://gallardo1337.io.evil.test','null']) {
  const app=setup(); const response=await app.handle(new Request('https://example.test',{method:'OPTIONS',headers:{Origin:origin}}));
  assert.equal(response.status,403); assert.equal(response.headers.get('Access-Control-Allow-Origin'),null); assert.equal(app.count(),0);
 }
 assert.equal((await setup().call(id, '')).status, 401);
 const denied = setup({ denied: true }); assert.equal((await denied.call()).status, 403); assert.equal(denied.count(), 0);
 assert.equal((await setup().call('https://evil.test/')).status, 400);
 const good = setup(); const response = await good.call(); const result = await response.json();
 assert.equal(response.status, 200); assert.equal(result.total, 9749.27); assert.equal(result.currency, 'EUR'); assert.equal(result.itemCount, 884); assert.equal(result.sourceUpdated, '2 hours ago');
 assert.equal(result.avatarURL, 'https://avatars.steamstatic.com/abcd_full.jpg');
 assert.equal(good.parse(html.replace('https://avatars.steamstatic.com/abcd_full.jpg', 'https://evil.test/abcd.jpg')).avatarURL, null);
 assert.equal(result.source, 'SteamAnalyst SA Price'); await good.call(); assert.equal(good.count(), 1);
 assert.equal((await setup({ status: 429 }).call()).status, 429);
 assert.equal((await setup({ html: '<h1>Protection</h1>' }).call()).status, 502);
 assert.equal(good.parse('<div>CS.Money $99.99</div>'), null);
 assert.equal(good.parse(html.replace('$<!-- -->10,832.52', '$0.00')).total, 0);
 console.log('PASS: exact SA Price, auth, URL validation, source age, caching and errors.');
})().catch(error => { console.error(error); process.exitCode = 1; });
