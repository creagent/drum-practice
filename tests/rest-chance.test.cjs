const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const core = vm.createContext({});
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], core);
const definitions = vm.runInContext('GENERATION_DURATIONS', core);
const barTicks = vm.runInContext('BAR_TICKS', core);
const all = Object.fromEntries(definitions.map(d => [d.id, {notes:true, rests:true}]));
const seeded = () => {
  let seed = 1689;
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2**32);
};

for (const invalid of [-0.01, 1, 100, NaN, Infinity]) {
  assert.throws(() => core.makeEtude(1, all, invalid), /от 0 до 99/);
}

// Every family, including every position inside a tuplet, uses the same chance.
for (const definition of definitions) {
  const selection = {[definition.id]:{notes:true, rests:true}};
  for (const chance of [0, 0.01, 0.3, 0.75, 0.99]) {
    const measures = core.makeEtude(64, selection, chance, seeded(), false).measures;
    const events = measures.flat();
    const ratio = events.filter(e => e.rest).length / events.length;
    assert.ok(Math.abs(ratio - chance) < 0.12, `${definition.id}: ${ratio} vs ${chance}`);
    if (chance === 0) assert.ok(events.every(e => !e.rest));
    for (const measure of measures) {
      assert.equal(measure.reduce((sum, e) => sum + e.ticks, 0), barTicks);
      const simplified = core.simplifyMeasure(measure, selection);
      assert.deepEqual(Array.from(simplified.filter(e => !e.rest), e => e.time), Array.from(measure.filter(e => !e.rest), e => e.time));
    }
  }
  const notes = core.makeEtude(8, {[definition.id]:{notes:true}}, 0.99).measures.flat();
  assert.ok(notes.every(e => !e.rest), 'Unchecked rests stay excluded');
  const rests = core.makeEtude(8, {[definition.id]:{rests:true}}, 0.01).measures.flat();
  assert.ok(rests.every(e => e.rest), 'Unchecked notes stay excluded');
  assert.throws(() => core.makeEtude(1, {[definition.id]:{rests:true}}, 0), /длительность ноты/);
}

for (const chance of [0, 0.01, 0.3, 0.75, 0.99]) {
  const events = core.makeEtude(64, all, chance, seeded(), false).measures.flat();
  const ratio = events.filter(e => e.rest).length / events.length;
  assert.ok(Math.abs(ratio - chance) < 0.05, `All families: ${ratio} vs ${chance}`);
}

// Rest-only families must also respond to the global slider.
const disjoint = {eighth:{notes:true}, sextuplet:{rests:true}};
const restTime = chance => core.makeEtude(64, disjoint, chance, seeded(), false).measures.flat().filter(e => e.rest).reduce((sum, e) => sum + e.ticks, 0);
assert.equal(restTime(0), 0);
assert.ok(restTime(0.99) > restTime(0.01));

// Regression: initial form settings used to disable all tuplet rests.
const inputs=Array.from(html.matchAll(/<input\b[^>]*>/g),match=>match[0]);
const defaults=Object.fromEntries(definitions.map(d=>[d.id,Object.fromEntries(['notes','rests'].map(kind=>[
  kind,inputs.some(input=>input.includes(`name="${kind}"`)&&input.includes(`value="${d.id}"`)&&/\bchecked\b/.test(input))
]))]));
const defaultMeasures=core.makeEtude(64,defaults,0.3,seeded(),false).measures;
for(const type of ['triplet','quintuplet','sextuplet']) {
  assert.ok(defaultMeasures.some(measure=>measure.some(event=>{
    if(event.type!==type)return false;
    const group=measure.filter(e=>e.tuplet===event.tuplet);
    return group.some(e=>e.rest)&&group.some(e=>!e.rest);
  })),`${type} must produce mixed note/rest groups with the initial UI settings`);
}

console.log('PASS: shared rest probability 0–99%, all five families, tuplets, checkbox restrictions, disjoint selections, complete bars and preserved attacks.');
