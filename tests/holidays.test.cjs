const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');const context={};vm.createContext(context);vm.runInContext(fs.readFileSync('holidays.js','utf8'),context);
const h=context.kh7Holidays;
for(const [year,dates] of [[2026,['04-03','04-06','05-14','05-25','06-04']],[2027,['03-26','03-29','05-06','05-17','05-27']],[2028,['04-14','04-17','05-25','06-05','06-15']]]){
 const values=h(year);assert.equal(values.size,11);assert.equal([...values.values()].filter(x=>x.scope==='bundesweit').length,9);
 for(const [i,name] of ['Karfreitag','Ostermontag','Christi Himmelfahrt','Pfingstmontag','Fronleichnam'].entries())assert.equal(values.get(`${year}-${dates[i]}`).name,name);
 assert.equal(values.get(`${year}-11-01`).scope,'NRW');assert.equal(values.get(`${year}-10-03`).scope,'bundesweit');assert(!values.has(`${year}-12-24`));assert(!values.has(`${year}-10-31`));
}
console.log('PASS: 11 NRW holidays, 9 national holidays; movable dates 2026–2028, no Christmas Eve or Reformation Day.');
