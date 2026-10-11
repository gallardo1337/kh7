const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

class Node {
  constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.dataset = {}; this.attrs = {}; this.value = ''; this.className = ''; this._text = ''; this.style = { setProperty(name,value) { this[name]=value; } }; }
  get classList() { return { add: (...values) => { this.className = [...new Set([...this.className.split(' '), ...values])].join(' '); }, remove: (...values) => { this.className = this.className.split(' ').filter(v => !values.includes(v)).join(' '); }, contains: value => this.className.split(' ').includes(value), toggle: (value, force) => { const add = force ?? !this.classList.contains(value); this.classList[add ? 'add' : 'remove'](value); } }; }
  set textContent(value) { this._text = value; this.children = []; }
  get textContent() { return this._text + this.children.map(n => n.textContent).join(''); }
  append(...nodes) { nodes.forEach(n => { n.parent = this; this.children.push(n); }); }
  replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }
  removeAttribute(name) { delete this.attrs[name]; }
  setAttribute(name, value) { this.attrs[name] = value; }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  async emit(name, props = {}) { for (const fn of this.listeners[name] || []) await fn({ target: this, preventDefault() {}, stopPropagation() {}, ...props }); }
  querySelectorAll(selector) {
    const matches = n => selector.split(',').some(s => {
      if (s.startsWith('[data-')) { const key = s.slice(6, -1).replace(/-([a-z])/g, (_, l) => l.toUpperCase()); return Object.hasOwn(n.dataset, key); }
      return n.tagName === s;
    });
    const all = []; const visit = n => { for (const c of n.children) { if (matches(c)) all.push(c); visit(c); } }; visit(this); return all;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  focus() {}
  setPointerCapture() {}
  getBoundingClientRect() { return {width:parseFloat(this.style.width)||272,height:parseFloat(this.style.height)||340}; }
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
    document, localStorage: { getItem: key => store.get(key) || null, setItem: () => { throw Error("Dashboard must not write localStorage"); }, removeItem: key => store.delete(key) },
    state: { isAdmin: false, user: null, client: { from: table => {
      assert.equal(table, 'dashboard_notes');
      return {
        select: () => ({ eq: (column, id) => ({ maybeSingle: async () => ({ data: cloud.get(id) || null, error: cloudError ? { message: 'offline' } : null }) }) }),
        upsert: async payload => { if (cloudError) return { error: { message: 'offline' } }; cloud.set(payload.user_id, { ...payload }); return { error: null }; },
      };
    }, auth: { getSession: async () => ({ data: { session: { access_token: 'valid-token' } } }) } } },
    showToast: message => alerts.push(message), openAddTileModal: () => tileDialogs++, AbortController, clearTimeout, setTimeout,
    window: { confirm: () => true, KH7_CONFIG: { supabaseUrl: "https://test.supabase.co", supabasePublishableKey: "public-key" }, setTimeout, setInterval() {}, addEventListener: (event, fn) => { events[event] = fn; } },
    fetch: async (url, options) => {
      let data; let ok = true;
      if (url.includes('AssetPairs')) data = { error: [], result: markets };
      else if (url.includes('Ticker')) {
        if (failCrypto) throw Error('Offline');
        data = { error: [], result: { XXBTZEUR: { c: ['10000'] }, XETHZEUR: { c: ['2000'] }, XXBTZUSD: { c: ['15000'] } } };
      } else if (url === 'https://test.supabase.co/functions/v1/cs2-inventory') {
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
  return { ids, document, alerts, openMenu: () => context.window.KH7_OPEN_ADD_MENU(), tileDialogs: () => tileDialogs, online: () => events.online(), session: detail => events['kh7-session']({ detail }), grid: ids['modules-grid'], picker: document.body.children[0] };
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
const persisted = () => ({ ...cloud.get('user-a')?.module_settings, noteItems: cloud.get('user-a')?.note_items });
const sync = async () => { await new Promise(resolve => setTimeout(resolve, 460)); await flush(); };

(async () => {
  // Migrate local modules without replacing already-online notes.
  store.set('kh7-modules-v1:user-a', JSON.stringify({ enabled:['crypto','cs2'], currency:'USD', holdings:[{symbol:'BTC',amount:2}], profiles:[{label:'Hauptaccount',profile:'76500000000000001'}] }));
  cloud.set('user-a', { content:'Online-Notiz',color:'pink',enabled:true,note_items:[{id:'existing',content:'Online-Notiz',color:'pink',collapsed:false,side:'right'}] });
  const app = create(); app.session({isAdmin:true,userId:'user-a'}); await flush(); await sync();
  assert.equal(store.has('kh7-modules-v1:user-a'),false);
  assert.equal(persisted().holdings[0].amount,2); assert.equal(persisted().currency,'USD'); assert.equal(persisted().profiles[0].label,'Hauptaccount');
  assert.equal(persisted().noteItems[0].content,'Online-Notiz'); assert.equal(app.ids['notes-dock-right'].children.length,1);
  assert.equal(card(app,'notes').querySelector('[data-note-status]').classList.contains('hidden'),true);
  assert(!getButton(card(app,'notes'),'Synchronisieren'));
  await addCoin(app,'BTC','1,5'); await sync(); assert.equal(persisted().holdings[0].amount,1.5);
  await addProfile(app,'Lager','76500000000000002'); await sync(); assert.equal(persisted().profiles.length,2);
  await enable(app,'notes'); await sync(); assert.equal(persisted().noteItems.length,2);
  const added = app.ids['notes-dock'].children[0]; added.querySelector('textarea').value='<script>text only</script>'; await added.querySelector('textarea').emit('input');
  await getButton(added,'−').emit('click');
  await added.querySelectorAll('button').find(b=>b.dataset.color==='blue').emit('click');
  const transfer={setData(){}}; await added.querySelector('[data-note-drag]').emit('dragstart',{dataTransfer:transfer});
  await app.ids['notes-dock-right'].emit('drop',{dataTransfer:transfer}); await sync();
  assert.equal(persisted().noteItems[1].side,'right'); assert.equal(persisted().noteItems[1].collapsed,true); assert.equal(persisted().noteItems[1].color,'blue');
  // A fresh browser has no local dashboard data and restores everything online.
  const peer=create(); peer.session({isAdmin:true,userId:'user-a'}); await flush();
  assert.equal(peer.ids['notes-dock-right'].children.length,2); assert.equal(peer.ids['inventory-values'].children.length,2);
  assert.equal(card(peer,'crypto').querySelectorAll('select')[0].value,'USD');
  assert.equal(peer.ids['notes-dock-right'].children[1].querySelector('textarea').value,'<script>text only</script>');
  peer.openMenu(); assert.equal(peer.ids['inventory-settings'].parent.children[0].dataset.addModule,'cs2');
  await peer.ids['inventory-settings'].emit('click'); assert(peer.picker.classList.contains('hidden'));
  // Old local data on another device must never override a migrated account.
  store.set('kh7-modules-v1:user-a', JSON.stringify({enabled:['crypto'],holdings:[{symbol:'BTC',amount:999}]}));
  const stale=create(); stale.session({isAdmin:true,userId:'user-a'}); await flush(); assert.equal(store.has('kh7-modules-v1:user-a'),false);
  assert.match(card(stale,'crypto').textContent,/1,5/); assert.equal(persisted().holdings[0].amount,1.5);
  // Failed writes keep the server unchanged, and online reconnection retries automatically.
  cloudError=true; const note=peer.ids['notes-dock-right'].children[0]; note.querySelector('textarea').value='Unsaved edit'; await note.querySelector('textarea').emit('input'); await sync();
  assert.equal(persisted().noteItems[0].content,'Online-Notiz'); assert.match(note.textContent,/Cloud-Speicherung fehlgeschlagen/); assert.equal(store.size,0);
  cloudError=false; peer.online(); await flush(); assert.equal(persisted().noteItems[0].content,'Unsaved edit');
  await peer.ids['notes-dock-right'].children[1].querySelectorAll('button').find(b=>b.attrs['aria-label']==='Notiz löschen').emit('click'); await sync(); assert.equal(persisted().noteItems.length,1);
  peer.session({isAdmin:false,userId:null}); assert.equal(peer.ids['inventory-values'].children.length,0); assert.equal(peer.ids['notes-dock-right'].children.length,0);
  peer.session({isAdmin:true,userId:'user-b'}); await flush(); assert.equal(peer.ids['inventory-values'].children.length,0); assert.equal(peer.ids['notes-dock-right'].children.length,0);
  // A failed initial read cannot replace an existing remote account with defaults.
  cloudError=true; const blocked=create(); blocked.session({isAdmin:true,userId:'user-a'}); await sync(); blocked.openMenu(); assert(blocked.picker.classList.contains('hidden')); assert.equal(persisted().holdings[0].amount,1.5);
  cloudError=false; blocked.online(); await flush(); assert.equal(blocked.ids['inventory-values'].children.length,2);
  // Resizing and sorting survive a fresh login, cancellation never persists a size.
  await enable(blocked,'notes'); await sync();
  let resizable=blocked.ids['notes-dock'].children[0];
  let grip=resizable.querySelector('[data-note-resize]');
  await grip.emit('pointerdown',{pointerId:1,clientX:0,clientY:0,button:0});
  await grip.emit('pointermove',{pointerId:1,clientX:88,clientY:100});
  await grip.emit('pointerup',{pointerId:1}); await sync();
  assert.equal(persisted().noteItems[1].width,360); assert.equal(persisted().noteItems[1].height,440);
  await grip.emit('pointerdown',{pointerId:2,clientX:0,clientY:0,button:0});
  await grip.emit('pointermove',{pointerId:2,clientX:9999,clientY:9999});
  await grip.emit('pointercancel',{pointerId:2}); assert.equal(resizable.style.width,'360px');
  await blocked.ids['notes-dock'].children[0].querySelector('[data-note-drag]').emit('click'); await sync();
  assert.equal(blocked.ids['notes-dock-right'].children[1].dataset.noteId,persisted().noteItems[1].id);
  const sizedPeer=create(); sizedPeer.session({isAdmin:true,userId:'user-a'}); await flush();
  const resized=sizedPeer.ids['notes-dock-right'].children[1]; assert.equal(resized.style.width,'360px'); assert.equal(resized.style.height,'440px');
  await getButton(resized,'−').emit('click'); assert.equal(resized.style.height,''); await getButton(resized,'+').emit('click'); assert.equal(resized.style.height,'440px');
  await resized.querySelector('[data-note-resize]').emit('keydown',{key:'ArrowDown'}); await sync(); assert.equal(persisted().noteItems[1].height,460);
  assert.equal(sizedPeer.ids['notes-dock-right'].children[0].dataset.noteId,persisted().noteItems[0].id);
  await sizedPeer.ids['notes-dock-right'].children[1].querySelector('[data-note-drag]').emit('keydown',{key:'ArrowUp'}); await sync();
  assert.equal(persisted().noteItems[0].width,360);
  console.log('PASS: one-time migration, online-only writes, notes and module restoration on fresh devices, stale local data, collapse/color/drag/delete, reconnect retry, failed initial reads, and account isolation.');
})().catch(error => { console.error(error); process.exitCode=1; });
