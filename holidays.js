"use strict";
// Gregorian Easter (Meeus/Jones/Butcher); all calculations use UTC calendar dates.
function kh7Holidays(year) {
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  const n=h+l-7*m+114, easter=new Date(Date.UTC(year,Math.floor(n/31)-1,n%31+1,12));
  const result=new Map();
  const add=(day,name,scope="bundesweit")=>result.set(day,{name,scope});
  const fixed=(day,name,scope)=>add(`${year}-${day}`,name,scope);
  const moving=(offset,name,scope)=>{ const date=new Date(easter); date.setUTCDate(date.getUTCDate()+offset); add(date.toISOString().slice(0,10),name,scope); };
  fixed("01-01","Neujahr"); moving(-2,"Karfreitag"); moving(1,"Ostermontag");
  fixed("05-01","Tag der Arbeit"); moving(39,"Christi Himmelfahrt"); moving(50,"Pfingstmontag"); moving(60,"Fronleichnam","NRW");
  fixed("10-03","Tag der Deutschen Einheit"); fixed("11-01","Allerheiligen","NRW"); fixed("12-25","1. Weihnachtstag"); fixed("12-26","2. Weihnachtstag");
  return result;
}
