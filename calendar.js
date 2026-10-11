"use strict";
(() => {
  const get = id => document.getElementById(id);
  const trigger = get("header-date"), modal = get("calendar-modal"), days = get("calendar-days"), list = get("calendar-events"), status = get("calendar-status");
  const form = get("calendar-form"), title = get("calendar-event-title"), date = get("calendar-event-date"), time = get("calendar-event-time"), description = get("calendar-event-description"), submit = get("calendar-save"), undo = get("calendar-undo");
  let owner = null, epoch = 0, request = 0, events = [], editing = null, deleted = null, busy = false, loaded = false;
  const today = () => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const part = type => parts.find(item => item.type === type).value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  };
  let selected = today(), month = selected.slice(0, 7);
  const asDate = day => new Date(`${day}T12:00:00Z`);
  const label = day => asDate(day).toLocaleDateString("de-DE", { timeZone:"UTC", weekday:"long", day:"2-digit", month:"2-digit", year:"numeric" });
  function element(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
  function button(text, action) { const node = element("button", text, "module-button"); node.type = "button"; node.addEventListener("click", action); return node; }
  ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].forEach(day => get("calendar-weekdays").append(element("span", day)));
  function close() { const wasOpen = !modal.classList.contains("hidden"); modal.classList.add("hidden"); trigger.setAttribute("aria-expanded", "false"); if (wasOpen) trigger.focus(); }
  function reset() { editing = null; title.value = ""; date.value = selected; time.value = ""; description.value = ""; submit.textContent = "Termin speichern"; }
  function render() {
    get("calendar-month").textContent = asDate(`${month}-01`).toLocaleDateString("de-DE", { timeZone:"UTC", month:"long", year:"numeric" });
    get("calendar-selected").textContent = label(selected);
    days.replaceChildren(); list.replaceChildren();
    const first = asDate(`${month}-01`), offset = (first.getUTCDay() + 6) % 7;
    const count = new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
    for (let blank = 0; blank < offset; blank++) days.append(element("span"));
    for (let day = 1; day <= count; day++) {
      const key = `${month}-${String(day).padStart(2,"0")}`, entries = events.filter(event => event.event_date === key);
      const node = button(String(day), () => { selected = key; reset(); render(); }); node.className = "calendar-day";
      node.dataset.day = key; node.dataset.today = String(key === today()); node.dataset.hasEvents = String(entries.length > 0);
      node.setAttribute("aria-pressed", String(key === selected)); node.setAttribute("aria-label", `${label(key)}${entries.length ? ` · ${entries.length} Termine` : ""}`); days.append(node);
    }
    const entries = events.filter(event => event.event_date === selected).sort((a,b) => (a.event_time || "").localeCompare(b.event_time || ""));
    if (!entries.length) list.append(element("p", loaded ? "Keine Termine an diesem Tag." : "Termine werden geladen …", "module-muted"));
    for (const event of entries) {
      const row = element("article", undefined, "calendar-event"); row.dataset.eventId = event.id;
      row.append(element("strong", `${event.event_time ? event.event_time.slice(0,5) : "Ganztägig"} · ${event.title}`));
      if (event.description) row.append(element("p",event.description));
      const actions = element("div", undefined, "calendar-event-actions");
      actions.append(button("Bearbeiten", () => { editing = event.id; title.value = event.title; date.value = event.event_date; time.value = event.event_time?.slice(0,5) || ""; description.value = event.description; submit.textContent = "Änderungen speichern"; title.focus(); }), button("Löschen", () => deleteEvent(event)));
      row.append(actions); list.append(row);
    }
    submit.disabled = busy; undo.disabled = busy;
  }
  async function load() {
    if (!owner) return;
    const current = ++request, session = epoch, user = owner; loaded = false; status.textContent = "Termine werden geladen …"; render();
    const first = `${month}-01`, firstDate = asDate(first);
    const end = new Date(Date.UTC(firstDate.getUTCFullYear(),firstDate.getUTCMonth()+1,0)).toISOString().slice(0,10);
    try {
      const response = await state.client.from("calendar_events").select("id,title,event_date,event_time,description").eq("user_id", user).is("deleted_at",null).gte("event_date",first).lte("event_date",end).order("event_date").limit(1000);
      if (session !== epoch || current !== request) return;
      if (response.error) throw response.error;
      events = response.data || []; loaded = true; status.textContent = ""; render();
    } catch { if (session === epoch && current === request) { status.textContent = "Termine konnten nicht geladen werden. Bitte erneut öffnen."; loaded = false; render(); } }
  }
  async function updateEvent(id, changes) {
    const response = await state.client.from("calendar_events").update({ ...changes, updated_at: new Date().toISOString() }).eq("user_id",owner).eq("id",id).select("id").single();
    if (response.error || !response.data) throw Error("Speichern fehlgeschlagen");
  }
  async function deleteEvent(event) {
    if (!owner || busy || !window.confirm("Diesen Termin löschen?")) return;
    const session = epoch; busy = true; render();
    try { await updateEvent(event.id,{deleted_at:new Date().toISOString()}); if (session !== epoch) return; deleted = event.id; undo.classList.remove("hidden"); if (editing === event.id) reset(); await load(); status.textContent = "Termin gelöscht."; }
    catch { if (session === epoch) status.textContent = "Termin konnte nicht gelöscht werden."; }
    finally { if (session === epoch) { busy = false; render(); } }
  }
  form.addEventListener("submit", async event => {
    event.preventDefault(); if (!owner || busy) return;
    const value = title.value.trim(), day = date.value;
    if (!value || value.length > 120 || !/^\d{4}-\d{2}-\d{2}$/.test(day) || (!Number.isFinite(asDate(day).getTime()) || asDate(day).toISOString().slice(0,10) !== day) || (time.value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time.value))) { status.textContent = "Bitte einen Titel und ein gültiges Datum eingeben."; return; }
    const session = epoch; busy = true; render(); status.textContent = "Wird gespeichert …";
    const payload = { title:value,event_date:day,event_time:time.value || null,description:description.value.slice(0,2000) };
    try {
      if (editing) await updateEvent(editing,payload);
      else { const response = await state.client.from("calendar_events").insert({ ...payload,user_id:owner }).select("id").single(); if (response.error || !response.data) throw Error("Speichern fehlgeschlagen"); }
      if (session !== epoch) return;
      selected = day; month = day.slice(0,7); reset(); await load(); status.textContent = "Termin gespeichert.";
    } catch { if (session === epoch) status.textContent = "Termin konnte nicht online gespeichert werden. Deine Eingaben bleiben erhalten."; }
    finally { if (session === epoch) { busy = false; render(); } }
  });
  undo.addEventListener("click", async () => {
    if (!deleted || !owner || busy) return; const session = epoch; busy = true; render();
    try { await updateEvent(deleted,{deleted_at:null}); if (session !== epoch) return; deleted = null; undo.classList.add("hidden"); await load(); status.textContent = "Termin wiederhergestellt."; }
    catch { if (session === epoch) status.textContent = "Wiederherstellen fehlgeschlagen."; }
    finally { if (session === epoch) { busy = false; render(); } }
  });
  function open() {
    if (!owner) { showToast("Bitte anmelden, um deinen Kalender zu öffnen."); return; }
    modal.classList.remove("hidden"); trigger.setAttribute("aria-expanded","true"); reset(); load(); get("calendar-close").focus();
  }
  trigger.addEventListener("click", () => modal.classList.contains("hidden") ? open() : close());
  get("calendar-close").addEventListener("click",close); get("calendar-backdrop").addEventListener("click",close);
  get("calendar-new").addEventListener("click", () => { reset(); title.focus(); });
  function navigate(offset) { const value = asDate(`${month}-01`); value.setUTCMonth(value.getUTCMonth()+offset); month = value.toISOString().slice(0,7); selected = `${month}-01`; events = []; reset(); load(); }
  get("calendar-prev").addEventListener("click",()=>navigate(-1)); get("calendar-next").addEventListener("click",()=>navigate(1));
  get("calendar-today").addEventListener("click",()=>{ selected=today(); month=selected.slice(0,7); reset(); load(); });
  modal.addEventListener("keydown",event=>{
    if(event.key==="Escape") { event.preventDefault(); close(); }
    if(event.key==="Tab") { const nodes=[...modal.querySelectorAll("button,input,textarea")].filter(node=>!node.disabled && !node.classList.contains("hidden")); const first=nodes[0],last=nodes[nodes.length-1]; if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();} else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();} }
  });
  function session(detail) { const next=detail.isAdmin ? detail.userId : null; if(next===owner)return; epoch++; request++; owner=next; events=[]; deleted=null; busy=false; loaded=false; selected=today(); month=selected.slice(0,7); undo.classList.add("hidden"); reset(); close(); }
  window.addEventListener("kh7-session",event=>session(event.detail));
  if(typeof state!=="undefined")session({isAdmin:state.isAdmin,userId:state.user?.id});
})();
