const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

class Node {
  constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.dataset = {}; this.attrs = {}; this.value = ''; this.className = ''; this._text = ''; }
  get classList() { return { add: (...values) => { this.className = [...new Set([...this.className.split(' '), ...values])].join(' '); }, remove: (...values) => { this.className = this.className.split(' ').filter(v => !values.includes(v)).join(' '); }, contains: value => this.className.split(' ').includes(value), toggle: (value, force) => { const add = force ?? !this.classList.contains(value); this.classList[add ? 'add' : 'remove'](value); } }; }
  set textContent(value) { this._text = value; this.children = []; }
  get textContent() { return this._text + this.children.map(n => n.textContent).join(''); }
  append(...nodes) { nodes.forEach(n => { n.parent = this; this.children.push(n); }); }
  replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }
  setAttribute(name, value) { this.attrs[name] = value; }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  async emit(name, props = {}) { for (const fn of this.listeners[name] || []) await fn({ target: this, preventDefault() {}, ...props }); }
  querySelectorAll(selector) {
    const matches = n => selector.split(',').some(s => {
      if (s.startsWith('[data-')) { const key = s.slice(6, -1).replace(/-([a-z])/g, (_, l) => l.toUpperCase()); return Object.hasOwn(n.dataset, key); }
      return n.tagName === s;
    });
    const all = []; const visit = n => { for (const c of n.children) { if (matches(c)) all.push(c); visit(c); } }; visit(this); return all;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  focus() {}
}

const code = fs.readFileSync(path.join(__dirname, '../modules.js'), 'utf8');
const store = new Map();
let failCrypto = false;
let failProfile = false;
let csrfCalls = 0;
const markets = { XXBTZEUR: { wsname: 'XBT/EUR', altname: 'XBTEUR' }, XETHZEUR: { wsname: 'ETH/EUR', altname: 'ETHEUR' }, XXBTZUSD: { wsname: 'XBT/USD', altname: 'XBTUSD' } };
function create() {
  const ids = Object.fromEntries(['modules-panel', 'modules-grid', 'modules-empty', 'add-tile-btn'].map(id => [id, new Node('div')]));
  ids['modules-panel'].className = 'hidden';
  const document = { body: new Node('body'), getElementById: id => ids[id], createElement: tag => new Node(tag), hidden: false };
  const events = {};
  const alerts = [];
  let tileDialogs = 0;
  const context = {
    document, localStorage: { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value) },
    state: { isAdmin: false, user: null, client: { auth: { getSession: async () => ({ data: { session: { access_token: 'valid-token' } } }) } } },
    showToast: message => alerts.push(message), openAddTileModal: () => tileDialogs++, AbortController, clearTimeout, setTimeout,
    window: { setTimeout, setInterval() {}, addEventListener: (event, fn) => { events[event] = fn; } },
    fetch: async (url, options) => {
      let data; let ok = true;
      if (url.includes('AssetPairs')) data = { error: [], result: markets };
      else if (url.includes('Ticker')) {
        if (failCrypto) throw Error('Offline');
        data = { error: [], result: { XXBTZEUR: { c: ['10000'] }, XETHZEUR: { c: ['2000'] }, XXBTZUSD: { c: ['15000'] } } };
      } else if (url === 'api/inventory.php') {
        csrfCalls++;
        assert.equal(options.headers.Authorization, 'Bearer valid-token');
        const body = JSON.parse(options.body);
        if (failProfile && body.profile.endsWith('002')) { ok = false; data = { error: 'Inventar privat' }; }
        else data = { total: body.profile.endsWith('001') ? 50 : 75, itemCount: 5, unpricedCount: body.profile.endsWith('001') ? 1 : 0, updatedAt: '2026-10-11T12:00:00Z' };
      } else throw Error('Unexpected URL ' + url);
      return { ok, headers: { get: () => 'application/json' }, json: async () => data };
    },
  };
  vm.createContext(context); vm.runInContext(code, context);
  return { ids, document, alerts, openMenu: () => context.window.KH7_OPEN_ADD_MENU(), tileDialogs: () => tileDialogs, session: detail => events['kh7-session']({ detail }), grid: ids['modules-grid'], picker: document.body.children[0] };
}
const flush = async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); };
const card = (app, id) => app.grid.children.find(c => c.dataset.module === id);
const getButton = (parent, text) => parent.querySelectorAll('button').find(b => b.textContent === text);
const enable = async (app, id) => { app.openMenu(); const item = app.picker.querySelectorAll('button').find(n => n.dataset.addModule === id); await item.emit('click'); await flush(); };
const addCoin = async (app, symbol, amount) => {
  const form = card(app, 'crypto').querySelector('form'); const inputs = form.querySelectorAll('input'); inputs[0].value = symbol; inputs[1].value = amount; await form.emit('submit'); await flush();
};
const addProfile = async (app, label, profile) => {
  const form = card(app, 'cs2').querySelector('form'); const inputs = form.querySelectorAll('input'); inputs[0].value = label; inputs[1].value = profile; await form.emit('submit');
};
const persisted = () => JSON.parse(store.get('kh7-modules-v1:user-a'));

(async () => {
  const app = create();
  assert(app.ids['modules-panel'].classList.contains('hidden'));
  app.openMenu(); assert(app.picker.classList.contains('hidden'));
  app.session({ isAdmin: true, userId: 'user-a' });
  assert(!app.ids['modules-panel'].classList.contains('hidden'));
  app.openMenu(); assert(!app.picker.classList.contains('hidden'));
  const linkChoice = app.picker.querySelectorAll('button').find(b => b.textContent.startsWith('Link-Kachel'));
  await linkChoice.emit('click'); assert.equal(app.tileDialogs(), 1); assert(app.picker.classList.contains('hidden'));
  await enable(app, 'notes');
  assert(app.picker.classList.contains('hidden'));
  app.openMenu(); assert(app.picker.querySelectorAll('button').find(b => b.dataset.addModule === 'notes').disabled);
  await enable(app, 'notes'); assert.equal(app.grid.children.length, 1);
  const notes = card(app, 'notes').querySelector('textarea'); notes.value = '<script>alert(1)</script> Meine Notiz'; await notes.emit('input');
  assert.equal(persisted().notes, notes.value);
  assert.equal(card(app, 'notes').dataset.noteColor, 'yellow');
  const pink = card(app, 'notes').querySelectorAll('button').find(b => b.dataset.color === 'pink');
  await pink.emit('click');
  assert.equal(persisted().noteColor, 'pink');
  assert.equal(card(app, 'notes').dataset.noteColor, 'pink');
  assert.equal(pink.attrs['aria-pressed'], 'true');
  assert.equal(card(app, 'notes').querySelector('textarea'), notes);
  assert.equal(persisted().notes, notes.value);
  await enable(app, 'crypto');
  await addCoin(app, 'BTC', '0,5');
  assert.equal(persisted().holdings[0].amount, 0.5);
  assert.match(card(app, 'crypto').textContent, /5\.000,00/);
  await addCoin(app, 'ETH', '2');
  assert.match(card(app, 'crypto').textContent, /9\.000,00/);
  await addCoin(app, 'BTC', '1');
  assert.equal(persisted().holdings.length, 2);
  assert.match(card(app, 'crypto').textContent, /14\.000,00/);
  await addCoin(app, 'BTC', '-4');
  assert.equal(persisted().holdings.find(h => h.symbol === 'BTC').amount, 1);
  await addCoin(app, 'UNKNOWN', '1');
  assert.equal(persisted().holdings.length, 2);
  failCrypto = true; await getButton(card(app, 'crypto'), 'Kurse aktualisieren').emit('click');
  assert.match(card(app, 'crypto').textContent, /Letzte Kurse bleiben sichtbar/);
  assert.match(card(app, 'crypto').textContent, /14\.000,00/); failCrypto = false;
  await enable(app, 'cs2');
  await addProfile(app, 'Hauptaccount', 'https://steamcommunity.com/profiles/76500000000000001');
  await addProfile(app, 'Lager', '76500000000000002');
  await addProfile(app, 'Duplikat', '76500000000000001'); assert.equal(persisted().profiles.length, 2);
  await addProfile(app, 'Unsicher', 'javascript:alert(1)'); assert.equal(persisted().profiles.length, 2);
  failProfile = true; await getButton(card(app, 'cs2'), 'Inventarwerte aktualisieren').emit('click');
  assert.match(card(app, 'cs2').textContent, /50,00/); assert.match(card(app, 'cs2').textContent, /Inventar privat/); assert.match(card(app, 'cs2').textContent, /Teilwert/);
  failProfile = false; await getButton(card(app, 'cs2'), 'Inventarwerte aktualisieren').emit('click');
  assert.match(card(app, 'cs2').textContent, /125,00/); assert.match(card(app, 'cs2').textContent, /1 ohne Preis/);
  assert.equal(csrfCalls, 4);
  const currency = card(app, 'cs2').querySelectorAll('select')[0]; currency.value = 'USD'; await currency.emit('change'); await flush();
  assert.equal(persisted().currency, 'USD'); assert.match(card(app, 'cs2').textContent, /Noch nicht geladen/);
  assert.match(card(app, 'crypto').textContent, /15\.000,00/); assert.match(card(app, 'crypto').textContent, /Kurs fehlt/);
  const before = persisted().notes;
  await getButton(card(app, 'notes'), 'Ausblenden').emit('click'); assert.equal(persisted().notes, before);
  await enable(app, 'notes'); assert.equal(card(app, 'notes').querySelector('textarea').value, before);
  assert.equal(card(app, 'notes').dataset.noteColor, 'pink');
  app.session({ isAdmin: false, userId: null }); assert.equal(app.grid.children.length, 0); assert(app.ids['modules-panel'].classList.contains('hidden'));
  app.session({ isAdmin: true, userId: 'user-b' }); assert.equal(app.grid.children.length, 0);
  app.session({ isAdmin: true, userId: 'user-a' }); assert.equal(card(app, 'notes').querySelector('textarea').value, before);
  const restored = create(); restored.session({ isAdmin: true, userId: 'user-a' }); assert.equal(card(restored, 'notes').querySelector('textarea').value, before);
  assert.equal(card(restored, 'notes').dataset.noteColor, 'pink');
  const invalidColor = persisted(); invalidColor.noteColor = 'invalid'; store.set('kh7-modules-v1:user-a', JSON.stringify(invalidColor));
  const repaired = create(); repaired.session({ isAdmin: true, userId: 'user-a' }); assert.equal(card(repaired, 'notes').dataset.noteColor, 'yellow');
  console.log('PASS: modules, note persistence, decimal input, portfolio totals, quantity replacement, invalid values, unavailable prices, profiles, duplicate prevention, partial inventory totals, shared currency, hide/restore, logout and account isolation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
