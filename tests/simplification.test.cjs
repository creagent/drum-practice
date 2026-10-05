const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const core=vm.createContext({});vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],core);
const definitions=vm.runInContext('DURATIONS',core);
const quarter=vm.runInContext('QUARTER_TICKS',core);
const sixteenths={sixteenth:{notes:true,rests:true}};
function sequence(items) {
  let time=0;
  return items.map(([type,rest=false,dotted=false])=>{
    const definition=definitions.find(d=>d.id===type);
    const ticks=definition.ticks*(dotted?1.5:1);
    const event={type,rest,dotted,ticks,time,tuplet:definition.tupletCount?Math.floor(time/quarter)*quarter:null};time+=ticks;return event;
  });
}
const shape=m=>Array.from(m,e=>[e.type,e.rest,e.dotted,e.time/quarter,e.ticks/quarter]);
for(const [count,type,ticks] of [[2,'eighth',0.5],[4,'quarter',1],[8,'half',2]]) {
  for(const allRests of [false,true]) {
    const original=sequence(Array.from({length:count},(_,i)=>['sixteenth',allRests||i>0]));
    const simplified=core.simplifyMeasure(original,sixteenths);
    assert.deepEqual(shape(simplified),[[type,allRests,false,0,ticks]],'Larger notes/rests are available without their generation checkboxes');
    assert.equal(JSON.stringify(core.makePlaybackPlan({bars:1,measures:[original]},90,true).sounds),JSON.stringify(core.makePlaybackPlan({bars:1,measures:[simplified]},90,true).sounds));
  }
}

for(const [items,type,ticks] of [
  [[['sixteenth',true],['eighth',true]],'eighth',0.75],
  [[['eighth',true],['sixteenth',true]],'eighth',0.75],
  [[['quarter',true],['eighth',true]],'quarter',1.5],
  [Array.from({length:6},()=>['sixteenth',true]),'quarter',1.5]
]) {
  const original=sequence([...items,['sixteenth']]);
  for(const selection of [sixteenths,{eighth:{notes:true,rests:true,dotted:true}}]) {
    const simplified=core.simplifyMeasure(original,selection);
    assert.deepEqual(shape(simplified).slice(0,1),[[type,true,true,0,ticks]],'Dotted rests simplify independently of selected note types and dots');
    assert.deepEqual(Array.from(simplified.filter(e=>!e.rest),e=>e.time),Array.from(original.filter(e=>!e.rest),e=>e.time));
    assert.equal((core.drawMeasure(simplified,240).match(/class="augmentation-dot"/g)||[]).length,1);
  }
}

// The circled passage: 16th rest, quarter note, 16th note, eighth rest.
// Preserve both attacks while revealing the beat between them.
const circled=sequence([['sixteenth',true],['quarter'],['sixteenth'],['eighth',true]]);
const readable=core.simplifyMeasure(circled,sixteenths);
assert.deepEqual(shape(readable),[
  ['sixteenth',true,false,0,0.25],['eighth',false,true,0.25,0.75],
  ['sixteenth',true,false,1,0.25],['sixteenth',false,false,1.25,0.25],['eighth',true,false,1.5,0.5]
]);
assert.deepEqual(shape(core.simplifyMeasure(readable,sixteenths)),shape(readable));
assert.equal(JSON.stringify(core.makePlaybackPlan({bars:1,measures:[circled]},90).sounds),JSON.stringify(core.makePlaybackPlan({bars:1,measures:[readable]},90).sounds));
// Exercise the same rule for generated note/rest runs and every sixteenth offset.
for(let offset=0;offset<quarter;offset+=quarter/4)for(const rest of [true,false])for(const dotted of [false,true]) {
  const selected={eighth:{notes:true,rests:true,dotted},sixteenth:{notes:true,rests:true}};
  const run=sequence([['quarter',rest],['eighth',true],['sixteenth']]).map(e=>({...e,time:e.time+offset}));
  const result=core.simplifyMeasure(run,selected);
  assert.ok(result.every(e=>e.time%quarter===0 || e.time%quarter+e.ticks<=quarter));
  assert.deepEqual(Array.from(result.filter(e=>!e.rest),e=>e.time),Array.from(run.filter(e=>!e.rest),e=>e.time));
  assert.equal(result.reduce((sum,e)=>sum+e.ticks,0),run.reduce((sum,e)=>sum+e.ticks,0));
  assert.deepEqual(shape(core.simplifyMeasure(result,selected)),shape(result));
}
const rawCircled=sequence([['sixteenth',true],['eighth'],['eighth',true],['sixteenth'],['eighth',true]]);
assert.deepEqual(shape(core.simplifyMeasure(rawCircled,sixteenths)),shape(readable),'The same grouping applies before an unreadable quarter could be created');

const attacks=sequence([['sixteenth'],['sixteenth'],['sixteenth'],['sixteenth']]);
assert.deepEqual(shape(core.simplifyMeasure(attacks,sixteenths)),shape(attacks),'Separate attacks never merge');
const restThenNote=sequence([['sixteenth',true],['sixteenth']]);
assert.deepEqual(shape(core.simplifyMeasure(restThenNote,sixteenths)),shape(restThenNote),'A leading rest cannot move an attack earlier');
const dottedRun=sequence([['sixteenth'],['sixteenth',true],['sixteenth',true]]);
const dotsOff=core.simplifyMeasure(dottedRun,sixteenths);
assert.ok(dotsOff.every(e=>!e.dotted));
assert.equal(dotsOff.length,2);
const withDots={...sixteenths,eighth:{notes:false,rests:false,dotted:true}};
const dotsOn=core.simplifyMeasure(dottedRun,withDots);
assert.deepEqual(shape(dotsOn),[['eighth',false,true,0,0.75]],'Dotted eighth spelling is independent of enabled eighth generation');
const longRun=sequence([['quarter'],['eighth',true]]);
assert.ok(core.simplifyMeasure(longRun,withDots).every(e=>!e.dotted||e.type==='eighth'),'Quarter and half dots are forbidden even when eighth dots are allowed');
for(const [type,count] of [['triplet',3],['quintuplet',5],['sextuplet',6]]) {
  const bounded=sequence([['quarter'],...Array.from({length:count},()=>[type,true]),['quarter']]);
  assert.deepEqual(shape(core.simplifyMeasure(bounded,withDots)),shape(bounded),'Do not merge across tuplet boundaries');
  const notes=core.makeEtude(1,{[type]:{notes:true}}).measures[0];
  const drawing=core.drawMeasure(notes,700);
  assert.equal((drawing.match(new RegExp('>'+count+'</text>','g'))||[]).length,4);
  if(count>3)assert.ok(drawing.includes(' 43H'),'Quintuplets and sextuplets have two beams');
}
const glyphs=core.drawMeasure(dotsOn,150);
assert.equal((glyphs.match(/class="augmentation-dot"/g)||[]).length,1);
let state=981;
const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/2**32);
for(const dotted of [false,true]) {
  const selected={eighth:{notes:true,rests:true,dotted},sixteenth:{notes:true,rests:true}};
  const sample=core.makeEtude(64,selected,0.3,random,false).measures.flat();
  assert.ok(sample.every(e=>!['half','quarter'].includes(e.type)),'Half and quarter notes only arise from simplification');
  assert.ok(sample.every(e=>!e.dotted||(dotted&&e.type==='eighth')));
  if(dotted)for(const rest of [false,true])assert.ok(sample.some(e=>e.dotted&&e.rest===rest),'Dotted eighth notes and rests can both generate');
  else assert.ok(sample.every(e=>!e.dotted));
}
assert.throws(()=>core.makeEtude(1,{half:{notes:true},quarter:{rests:true}}),/хотя бы одну/);
console.log('PASS: unrestricted simplification, half/quarter derived only, preserved attacks, optional eighth dots, tuplet boundaries and rendering.');
