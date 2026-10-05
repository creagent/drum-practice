const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const core=vm.createContext({TextEncoder});vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],core);
let seed=8237;
const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
let checked=0;
for(let notes=1;notes<=64;notes++)for(const max of new Set([1,Math.ceil(notes/2),notes]))for(const rng of [random,()=>0,()=>0.999999]){
  const exercise=core.makeAccentEtude(2,3,notes,max,rng);
  assert.equal(exercise.measures.length,2);
  for(let bar=0;bar<2;bar++){
    const measure=exercise.measures[bar];
    assert.equal(measure.length,3*notes);
    assert.ok(Math.abs(measure.reduce((sum,e)=>sum+e.ticks,0)-360)<1e-8);
    for(let beat=0;beat<3;beat++){
      const group=measure.filter(e=>e.beat===beat),positions=exercise.accentPositions[bar][beat];
      assert.equal(group.length,notes);
      assert.ok(group.every(e=>!e.rest),'All accent positions are notes');
      assert.ok(positions.length>=1&&positions.length<=max);
      assert.equal(new Set(positions).size,positions.length);
      assert.deepEqual(Array.from(group.filter(e=>e.accented),e=>e.position),Array.from(positions));
      assert.ok(group.every((e,i)=>Math.abs(e.time-(beat*120+i*120/notes))<1e-10));
      assert.ok(group.every(e=>!e.dotted&&e.beams===Math.floor(Math.log2(notes))));
      const tuplets=(notes&(notes-1))!==0;
      assert.ok(group.every(e=>tuplets?e.tuplet===beat*120&&e.tupletCount===notes:e.tuplet===null));
    }
    const drawing=core.drawMeasure(measure,core.measureMinWidth(measure));
    assert.ok(!/NaN|undefined|Infinity/.test(drawing));
    assert.equal((drawing.match(/<ellipse /g)||[]).length,measure.length);
    assert.equal((drawing.match(/class="accent-mark"/g)||[]).length,exercise.accentPositions[bar].flat().length);
    const beams=Math.floor(Math.log2(notes));
    assert.equal((drawing.match(/stroke-width="3.7"/g)||[]).length,3*(notes-1)*beams,'Continuous beams connect each beat, never neighboring beats');
    checked++;
  }
  const plan=core.makePlaybackPlan(exercise,120,true),hits=plan.sounds.filter(s=>s.kind==='drum'||s.kind==='softDrum');
  const expected=exercise.measures.flatMap((m,bar)=>m.filter(e=>!e.rest).map(e=>(bar*360+e.time)/240));
  assert.equal(hits.length,expected.length);
  const events=exercise.measures.flat();
  assert.ok(hits.every((s,i)=>s.kind===(events[i].accented?'drum':'softDrum')),'Accents and unmarked notes have different dynamics');
  assert.ok(hits.every((sound,i)=>Math.abs(sound.at-expected[i])<1e-10));
  assert.equal(plan.duration,3);
  assert.deepEqual(Array.from(plan.sounds.filter(s=>s.kind==='accent'),s=>s.at),[0,1.5]);
  assert.equal(plan.sounds.filter(s=>s.kind==='accent'||s.kind==='click').length,6);
}
for(const [bars,beats,notes,max] of [[0,4,3,1],[257,4,3,1],[1,0,3,1],[1,65,3,1],[1,4,0,1],[1,4,65,1],[1,4,3,0],[1,4,3,4],[1,4,3.5,1]])assert.throws(()=>core.makeAccentEtude(bars,beats,notes,max),/должно|Максимум/);
const legacy=core.makeAccentEtude(256,1,1,1);
assert.equal(legacy.measures.length,256);
const widest=core.makeAccentEtude(1,64,64,64,random);
assert.equal(widest.measures[0].length,4096);
const copy=core.accentText({subdivision:12,accentPositions:[[[1,10],[2]],[[3],[9,12]]]});
assert.deepEqual(Array.from(copy),['[1,10-2]','[3-9,12]']);
const sample=core.makeAccentEtude(20,3,5,2,random);
const slice=core.layoutScore(sample,390,1,16,20);
assert.deepEqual(Array.from(slice.rows,r=>r.start),[16,17,18,19]);
assert.ok(slice.rows[0].content.includes('data-measure="16"'));
const svg=core.scoreSVG(sample,2),pages=core.scorePDFPages(sample);
const marks=sample.accentPositions.flat(2).length;
assert.equal((svg.match(/class="accent-mark"/g)||[]).length,marks);
assert.equal((pages.join('').match(/class="accent-mark"/g)||[]).length,marks);
assert.ok(svg.includes('Акценты · 3/4'));
assert.ok(pages.every(p=>p.includes('Акценты · 3/4')));
assert.deepEqual(Array.from(pages.join('').matchAll(/data-measure="(\d+)"/g),m=>+m[1]),Array.from({length:20},(_,i)=>i));
console.log(`PASS: ${checked} accent measures; all 1–64 subdivisions, unique accents, beamed notes and accent marks, arbitrary meters, audio, notation, pagination, numeric copy and exports.`);
