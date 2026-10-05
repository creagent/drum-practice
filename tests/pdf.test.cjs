const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const core = vm.createContext({TextEncoder});
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], core);
for (const type of ['eighth', 'sixteenth', 'quintuplet', 'sextuplet']) {
  for (const bars of [1, 8, 31, 64]) {
    const etude = core.makeEtude(bars, {[type]:{notes:true}}, 0, () => 0);
    const pages = core.scorePDFPages(etude);
    const measures = Array.from(pages.join('').matchAll(/data-measure="(\d+)"/g), m => Number(m[1]));
    assert.deepEqual(measures, Array.from({length:bars}, (_, i) => i), 'Every measure is exported exactly once in order');
    assert.ok(pages.every(page => page.includes('width="595.28" height="841.89"')));
    assert.ok(!/NaN|undefined|Infinity/.test(pages.join('')));
    for (const page of pages) {
      for (const [, y, scale] of page.matchAll(/translate\(36 ([\d.]+)\) scale\(([\d.]+)\)/g)) {
        assert.ok(Number(y) >= 88 && Number(y) + 101 * Number(scale) <= 841.89 - 48, 'Whole score rows stay inside page margins');
      }
    }
    if (bars === 64) assert.ok(pages.length > 1, 'Long scores paginate');
  }
}

// Binary image bytes must not corrupt PDF object offsets or stream lengths.
const images = Array.from({length:3}, () => ({width:2480, height:3508, bytes:new Uint8Array([255,216,0,128,255,217])}));
const pdf = Buffer.from(core.makePDF(images));
const text = pdf.toString('latin1');
assert.ok(text.startsWith('%PDF-1.4'));
assert.ok(text.includes('/Count 3'));
const start = Number(text.match(/startxref\n(\d+)/)[1]);
assert.equal(pdf.subarray(start, start + 4).toString(), 'xref');
const entries = text.slice(start).split('\n').slice(3, 14);
for (let i = 0; i < entries.length; i++) {
  const offset = Number(entries[i].slice(0, 10));
  assert.ok(pdf.subarray(offset).toString('latin1').startsWith(`${i + 1} 0 obj\n`));
}
assert.equal((text.match(/\/Length 6 >>\nstream\n/g) || []).length, 3);
console.log('PASS: A4 pagination, complete measures, intact rows and margins, binary PDF streams and cross-reference offsets.');
