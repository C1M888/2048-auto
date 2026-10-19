'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createAI}=require('../ai.js');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const slide=Function('return '+html.slice(html.indexOf('function slide(')).split('\n')[0])();
const ai=createAI(),dirs=['left','up','right','down'];
let seed=17;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
for(let test=0;test<2000;test++){
  const ranks=Array.from({length:16},()=>random()<.3?0:1+Math.floor(random()*17));
  for(let d=0;d<4;d++){
    const expected=slide(ranks.map(v=>v?2**v:0),dirs[d]),actual=ai.move(ranks,d);
    assert.equal(actual!==null,expected.changed);
    if(actual)assert.deepEqual(actual.map(v=>v?2**v:0),expected.board);
  }
}
assert.equal(ai.choose([2,4,2,4,4,2,4,2,2,4,2,4,4,2,4,2]),null);
assert.ok(dirs.includes(ai.choose([2,2,...Array(14).fill(0)],1)));
const softCorner=[1024,2,4,8,512,4,8,16,256,8,16,32,128,16,32,32];
assert.ok(slide(softCorner,ai.choose(softCorner,10)).changed);
const budgets=[];
for(let i=0;i<20;i++){
  const b=Array.from({length:16},()=>random()<.3?0:2**(1+Math.floor(random()*10)));
  const start=performance.now(),direction=ai.choose(b,90);budgets.push(performance.now()-start);
  if(direction!==null)assert.ok(slide(b,direction).changed);
}
console.log('90 ms production budget checks: max '+Math.max(...budgets).toFixed(2)+' ms, mean '+(budgets.reduce((a,b)=>a+b,0)/budgets.length).toFixed(2)+' ms');
// Exercise the actual page request lifecycle without a browser dependency.
const start=html.indexOf('const fallbackAI='),end=html.indexOf("$('auto').onclick",start);
let worker;class FakeWorker {constructor(){worker=this;}postMessage(data){this.data=data;}terminate(){this.terminated=true;}}
const element={textContent:'',setAttribute(){}};
const context={createAI,Worker:FakeWorker,setTimeout,clearTimeout,performance,
  $:()=>element,board:[2,2,...Array(14).fill(0)],running:true,autoEpoch:0,timer:null,busy:false,moves:0,
  updateStatus(){},async move(){context.moves++;}};
vm.createContext(context);vm.runInContext(html.slice(start,end),context);
(async()=>{
  const first=context.choose(context.board);const old=worker;context.stop();assert.equal(await first,null);assert.ok(old.terminated);
  context.running=true;const second=context.choose(context.board);
  old.onmessage({data:{id:old.data.id,dir:'right'}});
  old.onerror({preventDefault(){}});assert.ok(!worker.terminated);
  worker.onmessage({data:{id:worker.data.id,dir:'left'}});assert.equal(await second,'left');
  context.running=true;const ticking=context.tick(context.autoEpoch);context.stop();await ticking;assert.equal(context.moves,0);
  const fallback=context.choose(context.board);worker.onerror({preventDefault(){}});assert.ok(dirs.includes(await fallback));
  console.log('PASS: 8000 move comparisons, large tiles, terminal board, legal escape, cancellation, stale responses, stopped tick and worker failure fallback');
})().catch(e=>{console.error(e);process.exitCode=1;});
