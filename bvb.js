"use strict";
(() => {
  let cache = null, pending = null;
  const el = (tag,text,cls) => { const n=document.createElement(tag); if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n; };
  const isBVB = team => Number(team?.teamId ?? team?.teamInfoId) === 7 || /borussia dortmund/i.test(team?.teamName || "");
  const kickoff = match => { const utc=match.matchDateTimeUTC; return utc ? new Date(/[zZ]|[+-]\d\d:\d\d$/.test(utc)?utc:`${utc}Z`) : null; };
  const season = () => { const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Berlin",year:"numeric",month:"numeric"}).formatToParts(new Date());const year=Number(parts.find(p=>p.type==="year").value),month=Number(parts.find(p=>p.type==="month").value);return month>=7?year:year-1; };
  async function get(path) {
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),15000);
    try { const r=await fetch(`https://api.openligadb.de/${path}`,{signal:controller.signal});if(!r.ok)throw Error("Datenquelle nicht erreichbar");const data=await r.json();if(!Array.isArray(data))throw Error("Ungültige Antwort");return data; } finally {clearTimeout(timer);}
  }
  async function load() {
    if(pending)return pending;
    pending=(async()=>{
      const currentSeason=season(); const results=await Promise.allSettled([get(`getmatchesbyteamid/7/1/20`),get(`getbltable/bl1/${currentSeason}`)]);
      const old=cache?.season===currentSeason?cache:null;
      cache={season:currentSeason,at:Date.now(),matches:results[0].status==="fulfilled"?results[0].value:old?.matches,table:results[1].status==="fulfilled"?results[1].value:old?.table,errors:results.map(r=>r.status==="rejected"),updated:new Date()};
    })().finally(()=>pending=null);return pending;
  }
  function paint(parent) {
    parent.replaceChildren();
    const refresh=el("button","Aktualisieren","module-button");refresh.type="button";refresh.disabled=Boolean(pending);refresh.addEventListener("click",async()=>{if(cache&&Date.now()-cache.at<60000)return;refresh.disabled=true;await load();paint(parent);});parent.append(refresh);
    if(!cache){parent.append(el("p","BVB-Daten werden geladen …","module-muted"));return;}
    parent.append(el("h4","Nächste Spiele"));
    if(cache.errors[0])parent.append(el("p","Spiele konnten nicht aktualisiert werden. Vorhandene Daten bleiben sichtbar.","module-muted"));
    const matches=(cache.matches||[]).filter(m=>!m.matchIsFinished&&(isBVB(m.team1)||isBVB(m.team2))&&kickoff(m)&&kickoff(m).getTime()>Date.now()-2*60*60*1000).sort((a,b)=>kickoff(a)-kickoff(b)).slice(0,5);
    if(!matches.length)parent.append(el("p","Keine kommenden Spiele in der Datenquelle verfügbar.","module-muted"));
    for(const match of matches){const row=el("article",undefined,"bvb-match");row.append(el("strong",`${match.team1?.shortName||match.team1?.teamName||"—"} – ${match.team2?.shortName||match.team2?.teamName||"—"}`),el("p",kickoff(match).toLocaleString("de-DE",{timeZone:"Europe/Berlin",weekday:"short",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}),"module-muted"),el("small",match.leagueName||"Wettbewerb"));parent.append(row);}
    parent.append(el("h4",`Bundesliga ${cache.season}/${String(cache.season+1).slice(-2)}`));
    if(cache.errors[1])parent.append(el("p","Tabelle konnte nicht aktualisiert werden. Vorhandene Daten bleiben sichtbar.","module-muted"));
    if(cache.table?.length){const table=el("table",undefined,"bvb-table");table.setAttribute("aria-label","Aktuelle Bundesliga-Tabelle");const head=el("thead"),header=el("tr");for(const name of ["#","Verein","Sp.","TD","Pkt."]){const th=el("th",name);th.setAttribute("scope","col");header.append(th);}head.append(header);table.append(head);const body=el("tbody");
      // Preserve the provider's ranking, including tie-break rules.
      cache.table.forEach((team,index)=>{const row=el("tr");if(isBVB(team))row.className="bvb-highlight";for(const value of [index+1,team.shortName||team.teamName,team.matches,team.goalDiff,team.points])row.append(el("td",String(value??"—")));body.append(row);});table.append(body);parent.append(table);
    }else parent.append(el("p","Noch keine Tabelle verfügbar.","module-muted"));
    const source=el("a","Daten: OpenLigaDB · ODbL","module-muted");source.href="https://www.openligadb.de/lizenz";source.target="_blank";source.rel="noopener noreferrer";parent.append(source,el("p",`Abruf ${cache.updated.toLocaleTimeString("de-DE",{timeZone:"Europe/Berlin",hour:"2-digit",minute:"2-digit"})} · Termine laut Datenquelle`,"module-muted"));
  }
  window.KH7_RENDER_BVB = parent => {paint(parent);if(!cache||cache.season!==season()||Date.now()-cache.at>=900000)load().then(()=>paint(parent));};
  window.setInterval(()=>{const nodes=[...document.querySelectorAll("[data-bvb-content]")];if(!document.hidden&&nodes.length)load().then(()=>nodes.forEach(paint));},900000);
})();
