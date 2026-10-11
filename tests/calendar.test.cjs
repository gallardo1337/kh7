const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
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


const code=fs.readFileSync('calendar.js','utf8'); const rows=new Map(); let fail=false,nextId=1;
const idsList=['header-date','calendar-modal','calendar-days','calendar-events','calendar-status','calendar-form','calendar-event-birthday','calendar-birthday-hint','calendar-date-label','calendar-event-title','calendar-event-date','calendar-event-time','calendar-event-description','calendar-save','calendar-undo','calendar-weekdays','calendar-month','calendar-selected','calendar-close','calendar-new','calendar-backdrop','calendar-prev','calendar-next','calendar-today'];
function app(){
 const ids=Object.fromEntries(idsList.map(id=>[id,new Node(id==='calendar-form'?'form':id.includes('event-description')?'textarea':id.startsWith('calendar-event-')?'input':'div')]));ids['calendar-modal'].className='hidden';
 const listeners={};const document={getElementById:id=>ids[id],createElement:tag=>new Node(tag),activeElement:null};
 const client={from:table=>{assert.equal(table,'calendar_events');return{
 select:()=>{const filter={};const q={eq:(key,value)=>{filter[key]=value;return q;},is:()=>q,gte:(key,value)=>{filter.first=value;return q;},lte:(key,value)=>{filter.last=value;return q;},order:()=>q,limit:async()=>({error:fail?{message:'offline'}:null,data:[...rows.values()].filter(row=>row.user_id===filter.user_id&&!row.deleted_at&&Boolean(row.is_birthday)===filter.is_birthday&&(!filter.first||row.event_date>=filter.first)&&(!filter.last||row.event_date<=filter.last)).map(row=>({...row}))})};return q;},
 insert:payload=>({select:()=>({single:async()=>{if(fail)return{error:{message:'offline'}};const row={...payload,id:String(nextId++),deleted_at:null};rows.set(row.id,row);return{data:{id:row.id}};}})}),
 update:changes=>{const filter={};const q={eq:(key,value)=>{filter[key]=value;return q;},select:()=>q,single:async()=>{if(fail)return{error:{message:'offline'}};const row=rows.get(filter.id);if(!row||row.user_id!==filter.user_id)return{error:{message:'denied'}};Object.assign(row,changes);return{data:{id:row.id}};}};return q;}
 };}};
 const alerts=[];const context={document,state:{isAdmin:false,user:null,client},window:{confirm:()=>true,addEventListener:(type,fn)=>listeners[type]=fn},showToast:text=>alerts.push(text)};vm.createContext(context);vm.runInContext(fs.readFileSync('holidays.js','utf8'),context);vm.runInContext(code,context);
 return{ids,alerts,session:id=>listeners['kh7-session']({detail:{isAdmin:Boolean(id),userId:id}})};
}
const flush=async()=>{for(let n=0;n<40;n++)await Promise.resolve();};
const click=async(node)=>{await node.emit('click');await flush();};const button=(parent,text)=>parent.querySelectorAll('button').find(node=>node.textContent===text);
(async()=>{
 const a=app();await click(a.ids['header-date']);assert(a.ids['calendar-modal'].classList.contains('hidden'));assert.equal(a.alerts.length,1);
 a.session('owner-a');await click(a.ids['header-date']);assert(!a.ids['calendar-modal'].classList.contains('hidden'));
 const today=a.ids['calendar-event-date'].value;assert.match(today,/^\d{4}-\d{2}-\d{2}$/);assert.equal(a.ids['calendar-weekdays'].children.length,7);
 a.ids['calendar-event-title'].value='<script>Nur Text</script>';a.ids['calendar-event-time'].value='12:30';a.ids['calendar-event-description'].value='Meine Notiz';await a.ids['calendar-form'].emit('submit');await flush();
 assert.equal(rows.size,1);const row=[...rows.values()][0];assert.equal(row.user_id,'owner-a');assert.equal(row.event_time,'12:30');assert.match(a.ids['calendar-events'].textContent,/12:30/);assert.match(a.ids['calendar-events'].textContent,/<script>Nur Text<\/script>/);
 assert.equal(a.ids['calendar-days'].children.find(node=>node.dataset.day===today).dataset.hasEvents,'true');
 await click(button(a.ids['calendar-events'],'Bearbeiten'));a.ids['calendar-event-title'].value='Geändert';a.ids['calendar-event-time'].value='';await a.ids['calendar-form'].emit('submit');await flush();assert.equal(row.title,'Geändert');assert.equal(row.event_time,null);assert.match(a.ids['calendar-events'].textContent,/Ganztägig/);
 await click(button(a.ids['calendar-events'],'Löschen'));assert(row.deleted_at);assert(!a.ids['calendar-undo'].classList.contains('hidden'));assert(!a.ids['calendar-events'].textContent.includes('Geändert'));
 await click(a.ids['calendar-undo']);assert.equal(row.deleted_at,null);assert.match(a.ids['calendar-events'].textContent,/Geändert/);
 const october=a.ids['calendar-event-date'].value.slice(0,7);if(october==='2026-10'){await click(a.ids['calendar-days'].children.find(n=>n.dataset.day==='2026-10-03'));assert.match(a.ids['calendar-events'].textContent,/Tag der Deutschen Einheit/);assert.equal(a.ids['calendar-days'].children.find(n=>n.dataset.day==='2026-10-03').dataset.holiday,'bundesweit');await click(a.ids['calendar-today']);}
 const previousMonth=a.ids['calendar-month'].textContent;await click(a.ids['calendar-next']);assert.notEqual(a.ids['calendar-month'].textContent,previousMonth);await click(a.ids['calendar-prev']);assert.equal(a.ids['calendar-month'].textContent,previousMonth);await click(a.ids['calendar-today']);
 const peer=app();peer.session('owner-a');await click(peer.ids['header-date']);assert.match(peer.ids['calendar-events'].textContent,/Geändert/);
 peer.session('owner-b');await click(peer.ids['header-date']);assert(!peer.ids['calendar-events'].textContent.includes('Geändert'));
 fail=true;a.ids['calendar-event-title'].value='Nicht gespeichert';await a.ids['calendar-form'].emit('submit');await flush();assert.equal(rows.size,1);assert.equal(a.ids['calendar-event-title'].value,'Nicht gespeichert');assert.match(a.ids['calendar-status'].textContent,/nicht online gespeichert/);fail=false;
 a.ids['calendar-event-date'].value='2026-99-99';await a.ids['calendar-form'].emit('submit');assert.match(a.ids['calendar-status'].textContent,/gültiges Datum/);assert.equal(rows.size,1);
 a.ids['calendar-event-birthday'].checked=true;await a.ids['calendar-event-birthday'].emit('change');a.ids['calendar-event-title'].value='Lisa';a.ids['calendar-event-date'].value='2000-02-29';await a.ids['calendar-form'].emit('submit');await flush();
 const birth=[...rows.values()].find(r=>r.title==='Lisa');assert.equal(birth.is_birthday,true);assert.equal(birth.event_time,null);
 const leap=Number(a.ids['calendar-selected'].textContent.slice(-4));const day=(leap%4===0&&leap%100!==0||leap%400===0)?'29':'28';await click(a.ids['calendar-days'].children.find(n=>n.dataset.day===`${leap}-02-${day}`));assert.match(a.ids['calendar-events'].textContent,/🎂 Lisa/);assert.match(a.ids['calendar-events'].textContent,/Jahre/);
 for(let i=0;i<12;i++)await click(a.ids['calendar-next']);const nextYear=leap+1;const nextDay=(nextYear%4===0&&nextYear%100!==0||nextYear%400===0)?'29':'28';await click(a.ids['calendar-days'].children.find(n=>n.dataset.day===`${nextYear}-02-${nextDay}`));assert.match(a.ids['calendar-events'].textContent,/🎂 Lisa/);
 await click(button(a.ids['calendar-events'],'Bearbeiten'));assert.equal(a.ids['calendar-event-date'].value,'2000-02-29');assert.equal(a.ids['calendar-event-birthday'].checked,true);await click(button(a.ids['calendar-events'],'Löschen'));assert(birth.deleted_at);await click(a.ids['calendar-undo']);assert.equal(birth.deleted_at,null);
 a.session(null);assert(a.ids['calendar-modal'].classList.contains('hidden'));assert.equal(a.ids['calendar-event-title'].value,'');
 console.log('PASS: calendar create/edit/delete/undo, optional time, month navigation, fresh-device restoration, account isolation, errors, invalid dates, and safe text rendering.');
})().catch(error=>{console.error(error);process.exitCode=1;});
