const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const core = vm.createContext({});
vm.runInContext(source, core);
const defs = vm.runInContext('DURATIONS', core);
const generatedDefs = vm.runInContext('GENERATION_DURATIONS', core);
const quarter = vm.runInContext('QUARTER_TICKS', core);
const combinationCount = 2 ** (generatedDefs.length * 2) - 1;
let seed=731;
const random = () => ((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
let tested=0;
for(let mask=1;mask<=combinationCount;mask++) for(const dotted of [false,true]) {
  const selection=Object.fromEntries(generatedDefs.map((d,i)=>[d.id,{notes:Boolean(mask&(1<<(i*2))),rests:Boolean(mask&(1<<(i*2+1)))}]));
  selection.eighth.dotted=dotted;
  const available=generatedDefs.filter(d=>selection[d.id].notes||selection[d.id].rests);
  for(const rng of [random,()=>0,()=>0.999999]) {
    const etude=core.makeEtude(3,selection,0.3,rng,false);
    assert.equal(etude.measures.length,3);
    for(const measure of etude.measures) {
      let time=0;
      for(let i=0;i<measure.length;i++) {
        const event=measure[i];
        assert.equal(event.time,time);
        assert.equal(event.ticks,defs.find(d=>d.id===event.type).ticks*(event.dotted?1.5:1));
        assert.ok(selection[event.type][event.rest?'rests':'notes']);
        assert.ok(!event.dotted || (dotted && event.type==='eighth'));
        const definition=defs.find(d=>d.id===event.type);
        if(definition.tupletCount) {
          assert.equal(event.tuplet%quarter,0);
          assert.ok(event.time>=event.tuplet&&event.time<event.tuplet+quarter);
          const group=measure.filter(e=>e.tuplet===event.tuplet);
          assert.equal(group.length,definition.tupletCount);
          assert.ok(group.every(e=>e.type===event.type&&e.ticks===quarter/definition.tupletCount&&!e.dotted));
        } else assert.equal(event.tuplet,null);
        time+=event.ticks;
      }
      assert.equal(time,quarter*4);
      assert.ok(new Set(measure.map(e=>e.type)).size>=Math.min(2,available.length));
      const simplified=core.simplifyMeasure(measure,selection);
      assert.ok(simplified.length<=measure.length);
      assert.deepEqual(Array.from(simplified.filter(e=>!e.rest),e=>e.time),Array.from(measure.filter(e=>!e.rest),e=>e.time));
      let simplifiedTime=0;
      for(const event of simplified){
        assert.equal(event.time,simplifiedTime);simplifiedTime+=event.ticks;
        assert.ok(!event.dotted || (dotted && event.type==='eighth'));
        assert.equal(event.ticks,defs.find(d=>d.id===event.type).ticks*(event.dotted?1.5:1));
      }
      assert.equal(simplifiedTime,quarter*4);
      assert.equal(JSON.stringify(core.simplifyMeasure(simplified,selection)),JSON.stringify(simplified));
      const before=core.makePlaybackPlan({bars:1,measures:[measure]},137,true);
      const after=core.makePlaybackPlan({bars:1,measures:[simplified]},137,true);
      assert.equal(JSON.stringify(before.sounds),JSON.stringify(after.sounds));
      const drawing=core.drawMeasure(simplified,core.measureMinWidth(simplified));
      assert.ok(!/NaN|undefined|Infinity/.test(drawing));
      tested++;
    }
  }
}
assert.throws(()=>core.makeEtude(1,{}),/хотя бы одну/);
for(const bars of [0,65,1.5,NaN])assert.throws(()=>core.makeEtude(bars,{eighth:{notes:true}}),/Количество/);
const short=core.makeEtude(9,{eighth:{rests:true}},0.3,random);
const wide=core.layoutScore(short,1200);
assert.equal(wide.columns,4);
assert.deepEqual(Array.from(wide.rows,r=>r.end-r.start),[4,4,1]);
const narrow=core.layoutScore(short,320);
assert.equal(narrow.columns,2);
assert.deepEqual(Array.from(narrow.rows,r=>r.end-r.start),[2,2,2,2,1]);
const dense=core.makeEtude(4,{sixteenth:{notes:true}},0.3,()=>0);
assert.equal(core.layoutScore(dense,1200).columns,2);
const mixed=core.drawMeasure([
  {type:'eighth',ticks:quarter/2,time:0,rest:false,tuplet:null},
  {type:'sixteenth',ticks:quarter/4,time:quarter/2,rest:false,tuplet:null},
  {type:'sixteenth',ticks:quarter/4,time:quarter*3/4,rest:false,tuplet:null}
],150);
assert.ok(mixed.includes(' 43H'), 'Sixteenths receive their secondary beam');
const svg=core.scoreSVG(short,4);
assert.ok(svg.includes('4/4')&&!/NaN|undefined|Infinity/.test(svg));
assert.ok(!html.includes('id="counts"')&&!html.includes('class="count"'));
console.log(`PASS: ${tested} measures across all ${combinationCount} checkbox combinations with dots on/off; 4/4 totals, vocabulary, tuplets, dotted values, simplification, identical playback, layout and rendering.`);
