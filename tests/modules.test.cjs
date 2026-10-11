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
  removeAttribute(name) { delete this.attrs[name]; }
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
const cloud = new Map();
let cloudError = false;
let failCrypto = false;
let failProfile = false;
let csrfCalls = 0;
const markets = { XXBTZEUR: { wsname: 'XBT/EUR', altname: 'XBTEUR' }, XETHZEUR: { wsname: 'ETH/EUR', altname: 'ETHEUR' }, XXBTZUSD: { wsname: 'XBT/USD', altname: 'XBTUSD' } };
function create() {
  const ids = Object.fromEntries(['modules-panel', 'modules-grid', 'modules-empty', 'add-tile-btn', 'notes-dock', 'notes-dock-right', 'dashboard-right-rail', 'portfolio-info', 'portfolio-panel', 'inventory-info', 'inventory-values', 'inventory-settings', 'inventory-panel'].map(id => [id, new Node('div')]));
  ids['modules-panel'].className = 'hidden';
  const document = { body: new Node('body'), getElementById: id => ids[id], createElement: tag => new Node(tag), hidden: false };
  const events = {};
  const alerts = [];
  let tileDialogs = 0;
  const context = {
    document, localStorage: { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value) },
    state: { isAdmin: false, user: null, client: { from: table => {
      assert.equal(table, 'dashboard_notes');
      return {
        select: () => ({ eq: (column, id) => ({ maybeSingle: async () => ({ data: cloud.get(id) || null, error: cloudError ? { message: 'offline' } : null }) }) }),
        upsert: async payload => { if (cloudError) return { error: { message: 'offline' } }; cloud.set(payload.user_id, { ...payload }); return { error: null }; },
      };
    }, auth: { getSession: async () => ({ data: { session: { access_token: 'valid-token' } } }) } } },
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
const card = (app, id) => [...app.grid.children, ...app.ids['notes-dock'].children, ...app.ids['notes-dock-right'].children, ...app.ids['portfolio-panel'].children, ...app.ids['inventory-panel'].children].find(c => c.dataset.module === id);
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
  assert(app.ids['modules-panel'].classList.contains('hidden'));
  app.openMenu(); assert(!app.picker.classList.contains('hidden'));
  const linkChoice = app.picker.querySelectorAll('button').find(b => b.textContent.startsWith('Link-Kachel'));
  await linkChoice.emit('click'); assert.equal(app.tileDialogs(), 1); assert(app.picker.classList.contains('hidden'));
  await enable(app, 'notes');
  assert(app.picker.classList.contains('hidden'));
  app.openMenu(); assert(!app.picker.querySelectorAll('button').find(b => b.dataset.addModule === 'notes').disabled);
  await enable(app, 'notes'); assert.equal(app.ids['notes-dock'].children.length, 2);
  const secondNote = app.ids['notes-dock'].children[1];
  secondNote.querySelector('textarea').value = 'Zweite unabhängige Notiz'; await secondNote.querySelector('textarea').emit('input');
  await getButton(secondNote, 'Zuklappen').emit('click');
  assert.equal(persisted().noteItems[1].collapsed, true);
  assert.equal(secondNote.querySelector('[data-note-toggle]').attrs['aria-expanded'], 'false');
  const notes = card(app, 'notes').querySelector('textarea'); notes.value = '<script>alert(1)</script> Meine Notiz'; await notes.emit('input');
  assert.equal(persisted().noteItems[0].content, notes.value);
  assert.equal(card(app, 'notes').dataset.noteColor, 'yellow');
  const pink = card(app, 'notes').querySelectorAll('button').find(b => b.dataset.color === 'pink');
  await pink.emit('click');
  assert.equal(persisted().noteItems[0].color, 'pink');
  assert.equal(card(app, 'notes').dataset.noteColor, 'pink');
  assert.equal(pink.attrs['aria-pressed'], 'true');
  assert.equal(card(app, 'notes').querySelector('textarea'), notes);
  assert.equal(persisted().noteItems[0].content, notes.value);
  await enable(app, 'crypto');
  await addCoin(app, 'BTC', '0,5');
  assert.equal(persisted().holdings[0].amount, 0.5);
  assert.match(card(app, 'crypto').textContent, /5\.000,00/);
  await addCoin(app, 'ETH', '2');
  assert.match(card(app, 'crypto').textContent, /9\.000,00/);
  assert.match(app.ids['portfolio-info'].textContent, /9\.000,00/);
  await app.ids['portfolio-info'].emit('click'); assert(app.ids['portfolio-panel'].classList.contains('hidden'));
  await app.ids['portfolio-info'].emit('click'); assert(!app.ids['portfolio-panel'].classList.contains('hidden'));
  assert.equal(app.ids['portfolio-info'].attrs['aria-expanded'], 'true');
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
  assert(!app.ids['inventory-info'].classList.contains('hidden'));
  assert(!app.ids['inventory-panel'].classList.contains('hidden'));
  await addProfile(app, 'Hauptaccount', 'https://steamcommunity.com/profiles/76500000000000001');
  await addProfile(app, 'Lager', '76500000000000002');
  assert.equal(app.ids['inventory-values'].children[0].href, 'https://www.steamanalyst.com/inventory/76500000000000001');
  assert.equal(app.ids['inventory-values'].children[0].textContent, 'Hauptaccount · CS2 —');
  assert.equal(app.ids['inventory-values'].children.length, 2);
  await addProfile(app, 'Duplikat', '76500000000000001'); assert.equal(persisted().profiles.length, 2);
  await addProfile(app, 'Unsicher', 'javascript:alert(1)'); assert.equal(persisted().profiles.length, 2);
  failProfile = true; await getButton(card(app, 'cs2'), 'Inventarwerte aktualisieren').emit('click');
  assert.match(card(app, 'cs2').textContent, /50,00/); assert.match(card(app, 'cs2').textContent, /Inventar privat/); assert.match(card(app, 'cs2').textContent, /Teilwert/);
  failProfile = false; await getButton(card(app, 'cs2'), 'Inventarwerte aktualisieren').emit('click');
  assert.match(card(app, 'cs2').textContent, /125,00/); assert.match(card(app, 'cs2').textContent, /1 ohne Preis/);
  assert.match(app.ids['inventory-values'].children[0].textContent, /≈ 50,00/);
  assert.equal(app.ids['inventory-values'].children[1].href, 'https://www.steamanalyst.com/inventory/76500000000000002');
  assert.match(app.ids['inventory-values'].children[1].textContent, /Lager.*75,00/);
  await app.ids['inventory-settings'].emit('click'); assert(app.ids['inventory-panel'].classList.contains('hidden'));
  await app.ids['inventory-settings'].emit('click'); assert(!app.ids['inventory-panel'].classList.contains('hidden'));
  assert.equal(csrfCalls, 4);
  const currency = card(app, 'cs2').querySelectorAll('select')[0]; currency.value = 'USD'; await currency.emit('change'); await flush();
  assert.equal(persisted().currency, 'USD'); assert.match(card(app, 'cs2').textContent, /Noch nicht geladen/);
  assert.match(card(app, 'crypto').textContent, /15\.000,00/); assert.match(card(app, 'crypto').textContent, /Kurs fehlt/);
  const before = persisted().noteItems[0].content;
  await getButton(card(app, 'notes'), 'Zuklappen').emit('click'); assert.equal(persisted().noteItems[0].content, before);
  await getButton(card(app, 'notes'), 'Aufklappen').emit('click'); assert.equal(card(app, 'notes').querySelector('textarea').value, before);
  assert.equal(card(app, 'notes').dataset.noteColor, 'pink');
  app.session({ isAdmin: false, userId: null }); assert.equal(app.grid.children.length, 0); assert(app.ids['modules-panel'].classList.contains('hidden'));
  assert.equal(app.ids['notes-dock'].children.length, 0); assert.equal(app.ids['portfolio-panel'].children.length, 0);
  assert(app.ids['inventory-info'].classList.contains('hidden')); assert(app.ids['inventory-panel'].classList.contains('hidden'));
  assert.equal(app.ids['inventory-values'].children.length, 0);
  app.session({ isAdmin: true, userId: 'user-b' }); assert.equal(app.grid.children.length, 0);
  app.session({ isAdmin: true, userId: 'user-a' }); assert.equal(card(app, 'notes').querySelector('textarea').value, before);
  const restored = create(); restored.session({ isAdmin: true, userId: 'user-a' }); assert.equal(card(restored, 'notes').querySelector('textarea').value, before);
  assert.equal(card(restored, 'notes').dataset.noteColor, 'pink');
  const invalidColor = persisted(); invalidColor.noteItems[0].color = 'invalid'; store.set('kh7-modules-v1:user-a', JSON.stringify(invalidColor));
  const repaired = create(); repaired.session({ isAdmin: true, userId: 'user-a' }); assert.equal(card(repaired, 'notes').dataset.noteColor, 'yellow');
  await flush();
  const syncedNote = card(repaired, 'notes').querySelector('textarea'); syncedNote.value = 'Geräteübergreifende Notiz'; await syncedNote.emit('input');
  await card(repaired, 'notes').querySelectorAll('button').find(b => b.dataset.color === 'blue').emit('click');
  await new Promise(resolve => setTimeout(resolve, 460)); await flush();
  assert.equal(cloud.get('user-a').note_items[0].content, 'Geräteübergreifende Notiz'); assert.equal(cloud.get('user-a').note_items[0].color, 'blue');
  store.delete('kh7-modules-v1:user-a');
  const secondBrowser = create(); secondBrowser.session({ isAdmin: true, userId: 'user-a' }); await flush();
  assert.equal(card(secondBrowser, 'notes').querySelector('textarea').value, 'Geräteübergreifende Notiz');
  assert.equal(card(secondBrowser, 'notes').dataset.noteColor, 'blue');
  assert.equal(secondBrowser.ids['notes-dock'].children.length, 2);
  assert.equal(secondBrowser.ids['notes-dock'].children[1].querySelector('textarea').value, 'Zweite unabhängige Notiz');
  assert.equal(secondBrowser.ids['notes-dock'].children[1].querySelector('[data-note-toggle]').attrs['aria-expanded'], 'false');
  cloudError = true;
  const offlineNote = card(secondBrowser, 'notes').querySelector('textarea'); offlineNote.value = 'Offline-Entwurf'; await offlineNote.emit('input');
  await new Promise(resolve => setTimeout(resolve, 460)); await flush();
  assert.match(card(secondBrowser, 'notes').textContent, /Cloud-Speicherung fehlgeschlagen/);
  assert.equal(persisted().notesPending, true); assert.equal(cloud.get('user-a').note_items[0].content, 'Geräteübergreifende Notiz');
  cloudError = false;
  await getButton(card(secondBrowser, 'notes'), 'Synchronisieren').emit('click');
  await new Promise(resolve => setTimeout(resolve, 460)); await flush();
  assert.equal(cloud.get('user-a').note_items[0].content, 'Offline-Entwurf'); assert.equal(persisted().notesPending, false);
  cloud.set('legacy-user', { content: 'Bisherige Notiz', color: 'green', enabled: true });
  const legacy = create(); legacy.session({ isAdmin: true, userId: 'legacy-user' }); await flush();
  assert.equal(card(legacy, 'notes').querySelector('textarea').value, 'Bisherige Notiz');
  assert.equal(card(legacy, 'notes').dataset.noteColor, 'green');
  await enable(legacy, 'notes'); assert.equal(legacy.ids['notes-dock'].children.length, 2);
  assert.equal(card(legacy, 'notes').querySelector('textarea').value, 'Bisherige Notiz');
  const originalId = card(legacy, 'notes').dataset.noteId;
  const transfer = { values: {}, setData(type, value) { this.values[type] = value; } };
  await card(legacy, 'notes').querySelector('[data-note-drag]').emit('dragstart', { dataTransfer: transfer });
  assert(legacy.document.body.classList.contains('notes-dragging'));
  assert(!legacy.ids['notes-dock-right'].classList.contains('hidden'));
  await legacy.ids['notes-dock-right'].emit('dragover', { dataTransfer: transfer });
  assert.equal(transfer.dropEffect, 'move');
  await legacy.ids['notes-dock-right'].emit('drop');
  assert.equal(legacy.ids['notes-dock-right'].children[0].dataset.noteId, originalId);
  assert.equal(legacy.ids['notes-dock'].children.length, 1);
  assert(!legacy.document.body.classList.contains('notes-dragging'));
  assert.equal(legacy.ids['notes-dock-right'].children[0].querySelector('textarea').value, 'Bisherige Notiz');
  await new Promise(resolve => setTimeout(resolve, 460)); await flush();
  assert.equal(cloud.get('legacy-user').note_items.find(note => note.id === originalId).side, 'right');
  store.delete('kh7-modules-v1:legacy-user');
  const moved = create(); moved.session({ isAdmin: true, userId: 'legacy-user' }); await flush();
  assert.equal(moved.ids['notes-dock-right'].children[0].dataset.noteId, originalId);
  await moved.ids['notes-dock-right'].children[0].querySelector('[data-note-drag]').emit('keydown', { key: 'ArrowLeft' });
  assert.equal(moved.ids['notes-dock-right'].children.length, 0);
  assert(moved.ids['dashboard-right-rail'].classList.contains('hidden'));
  const dragged = moved.ids['notes-dock'].children[1];
  await dragged.querySelector('[data-note-drag]').emit('dragstart', { dataTransfer: transfer });
  await moved.ids['notes-dock'].children[0].emit('drop', { stopPropagation() {} });
  assert.equal(moved.ids['notes-dock'].children[0].dataset.noteId, originalId);
  await moved.ids['notes-dock'].children[0].querySelector('[data-note-drag]').emit('click');
  assert.equal(moved.ids['notes-dock-right'].children[0].dataset.noteId, originalId);
  await moved.ids['notes-dock'].children[0].querySelector('[data-note-drag]').emit('dragstart', { dataTransfer: transfer });
  await moved.ids['notes-dock'].children[0].querySelector('[data-note-drag]').emit('dragend');
  assert(!moved.document.body.classList.contains('notes-dragging'));
  moved.session({ isAdmin: false, userId: null });
  await moved.ids['notes-dock-right'].emit('drop');
  assert.equal(moved.ids['notes-dock-right'].children.length, 0);
  console.log('PASS: notes, drag/drop, side and order persistence, keyboard/touch fallback, cancelled drag, account isolation, portfolio and inventories.');
})().catch(error => { console.error(error); process.exitCode = 1; });
