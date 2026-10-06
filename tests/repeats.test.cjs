const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const core=vm.createContext({TextEncoder});vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],core);
const count=(text,kind)=>(text.match(new RegExp(`class="repeat-${kind}"`,'g'))||[]).length;
for(const kind of ['etudes','accents'])for(const bars of [1,4,31,64]){
  const exercise=kind==='etudes'?core.makeEtude(bars,{sixteenth:{notes:true}},0):core.makeAccentEtude(bars,4,6,2);
  for(const columns of [1,2,4]){
    const layout=core.layoutScore(exercise,390,columns),drawing=layout.rows.map(r=>r.content).join('');
    assert.equal(count(drawing,'start'),1);assert.equal(count(drawing,'end'),1);
    assert.equal(count(layout.rows[0].content,'start'),1);assert.equal(count(layout.rows.at(-1).content,'end'),1);
    assert.ok(!/NaN|undefined|Infinity/.test(drawing));
  }
  const svg=core.scoreSVG(exercise,2),pages=core.scorePDFPages(exercise);
  assert.equal(count(svg,'start'),1);assert.equal(count(svg,'end'),1);
  assert.equal(count(pages.join(''),'start'),1);assert.equal(count(pages.join(''),'end'),1);
  assert.equal(count(pages[0],'start'),1);assert.equal(count(pages.at(-1),'end'),1);
  if(bars>16){
    const first=core.layoutScore(exercise,700,2,0,16).rows.map(r=>r.content).join('');
    const last=core.layoutScore(exercise,700,2,16,bars).rows.map(r=>r.content).join('');
    assert.equal(count(first,'start'),1);assert.equal(count(first,'end'),0);
    assert.equal(count(last,'start'),0);assert.equal(count(last,'end'),1);
  }
}
const one=core.makeEtude(1,{eighth:{rests:true}},0.3);
const drawing=core.layoutScore(one,200,1).rows[0].content;
assert.ok(drawing.indexOf('repeat-start')>drawing.indexOf('class="playback-bar"'),'Repeat marks stay above the playing-bar highlight');
assert.ok(drawing.indexOf('repeat-start')<drawing.indexOf('data-event="0"'));
assert.ok(drawing.indexOf('repeat-end')>drawing.lastIndexOf('data-event='));
console.log('PASS: opening/closing repeats once per exercise in both modes, mobile/desktop rows, paginated views and SVG/PDF.');
