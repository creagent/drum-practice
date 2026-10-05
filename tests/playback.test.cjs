const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const core=vm.createContext({});vm.runInContext(source,core);
const RhythmPlayer=vm.runInContext('RhythmPlayer',core);
const quarter=vm.runInContext('QUARTER_TICKS',core);
const fixture={bars:1,measures:[[
  {time:0,ticks:quarter,type:'quarter',rest:true},
  {time:quarter,ticks:quarter/2,type:'eighth',rest:false},
  {time:quarter*1.5,ticks:quarter/2,type:'eighth',rest:true},
  {time:quarter*2,ticks:quarter*2,type:'half',rest:false}
]]};
const plan=core.makePlaybackPlan(fixture,60,false);
assert.deepEqual(Array.from(plan.sounds,s=>s.at),[1,2]);
assert.equal(plan.duration,4);
assert.deepEqual(Array.from(plan.positions,p=>[p.at,p.end]),[[0,1],[1,1.5],[1.5,2],[2,4]]);
const fast=core.makePlaybackPlan(fixture,120,true);
assert.equal(fast.duration,2);
assert.deepEqual(Array.from(fast.sounds.filter(s=>s.kind==='drum'),s=>s.at),[.5,1]);
assert.deepEqual(Array.from(fast.sounds.filter(s=>s.kind!=='drum'),s=>s.at),[0,.5,1,1.5]);
const triplets=core.makeEtude(2,{triplet:{notes:true}});
const tripletPlan=core.makePlaybackPlan(triplets,120,true);
const hits=tripletPlan.sounds.filter(s=>s.kind==='drum');
assert.equal(hits.length,24);
for(let i=0;i<hits.length;i++)assert.ok(Math.abs(hits[i].at-i/6)<1e-12);
assert.deepEqual(Array.from(tripletPlan.sounds.filter(s=>s.kind==='accent'),s=>s.at),[0,2]);
for(const [type,count] of [['quintuplet',5],['sextuplet',6]]) {
  const etude=core.makeEtude(2,{[type]:{notes:true}});
  const plan=core.makePlaybackPlan(etude,120,true);
  const hits=plan.sounds.filter(s=>s.kind==='drum');
  assert.equal(hits.length,8*count);
  for(let i=0;i<hits.length;i++)assert.ok(Math.abs(hits[i].at-i/(2*count))<1e-12);
  assert.equal(plan.duration,4);
  const silent=core.makeEtude(1,{[type]:{rests:true}});
  assert.equal(core.makePlaybackPlan(silent,240,false).sounds.length,0);
  assert.equal(core.makePlaybackPlan(silent,240,true).sounds.length,4);
}
const rests=core.makeEtude(1,{eighth:{rests:true}});
assert.equal(core.makePlaybackPlan(rests,80,false).sounds.length,0);
assert.equal(core.makePlaybackPlan(rests,80,true).sounds.length,4);
for(const bpm of [0,39,241,80.5,NaN])assert.throws(()=>core.makePlaybackPlan(fixture,bpm),/Темп/);
function environment() {
  const sources=[],intervals=new Map(),frames=new Map();let id=0;
  const timers={setInterval(fn){intervals.set(++id,fn);return id;},clearInterval(key){intervals.delete(key);},requestAnimationFrame(fn){frames.set(++id,fn);return id;},cancelAnimationFrame(key){frames.delete(key);}};
  const context={state:'running',currentTime:0,sampleRate:48000,destination:{},
    createGain(){return {gain:{value:0,setTargetAtTime(value){this.value=value;}},connect(){}};},
    createBuffer(channels,length,sampleRate){const samples=new Float32Array(length);return {duration:length/sampleRate,getChannelData(){return samples;}};},
    createBufferSource(){const s={connect(){},disconnect(){this.disconnected=true;},start(when){this.when=when;},stop(){this.stopped=true;}};sources.push(s);return s;}
  };
  const reasons=[],positions=[];
  const player=new RhythmPlayer(context,{onStop:r=>reasons.push(r),onPosition:p=>positions.push(p)},timers);
  return {player,context,sources,timers,intervals,frames,reasons,positions};
}
const test=environment();
for(const buffer of Object.values(test.player.buffers)){
  const samples=buffer.getChannelData(0);
  assert.ok(samples.every(Number.isFinite));
  assert.ok(samples.some(x=>Math.abs(x)>.01),'Generated sound must not be silent');
  assert.ok(samples.every(x=>Math.abs(x)<=1),'Synthesized samples must not clip');
}
const rms=buffer=>Math.sqrt(buffer.getChannelData(0).reduce((sum,x)=>sum+x*x,0)/buffer.getChannelData(0).length);
assert.ok(rms(test.player.buffers.softDrum)<rms(test.player.buffers.drum)*0.4,'Unaccented notes are quieter');
test.player.setVolume(0);assert.equal(test.player.gain.gain.value,0);
test.player.setVolume(2);assert.equal(test.player.gain.gain.value,1);
test.player.play(plan);
assert.equal(test.sources.length,0,'Leading rest must be silent');
for(let t=0;t<4.2;t+=.025){
  test.context.currentTime=t;test.player.schedule();
  const frames=Array.from(test.frames.values());test.frames.clear();frames.forEach(fn=>fn());
  for(const source of test.sources)if(source.onended&&t>=source.when+source.buffer.duration){const callback=source.onended;source.onended=null;callback();}
}
assert.deepEqual(test.sources.map(s=>s.when),[1.08,2.08]);
assert.deepEqual(test.reasons,['ended']);
assert.equal(test.player.playing,false);assert.equal(test.player.sources.size,0);
assert.equal(test.intervals.size,0);assert.equal(test.frames.size,0);
assert.ok(test.positions.some(p=>p.index===0),'Leading rest gets a visual position');
const stopped=environment();stopped.player.play(tripletPlan);
assert.equal(stopped.sources.length,2,'First attack and metronome are scheduled together');
stopped.player.stop();
assert.ok(stopped.sources.every(s=>s.stopped&&s.disconnected));
assert.equal(stopped.intervals.size,0);assert.equal(stopped.frames.size,0);
stopped.context.currentTime=2;stopped.player.schedule();assert.equal(stopped.sources.length,2);
const delayed=environment();delayed.player.play(tripletPlan);delayed.context.currentTime=1;delayed.player.schedule();
assert.deepEqual(delayed.reasons,['interrupted']);assert.equal(delayed.sources.length,2,'Late hits must not burst');
const suspended=environment();suspended.player.play(plan);suspended.context.state='suspended';suspended.player.schedule();assert.deepEqual(suspended.reasons,['interrupted']);
console.log('PASS: note/rest timing, triplets/quintuplets/sextuplets, metronome, synthesis, scheduling, completion, cancellation and interruption.');
