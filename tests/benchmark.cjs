'use strict';
const fs=require('node:fs');
const {createAI}=require('../ai.js');
const baseline=fs.readFileSync(process.argv[2]||require('node:path').join(__dirname,'baseline.html'),'utf8');
const extract=name=>baseline.slice(baseline.indexOf('function '+name+'(')).split('\n')[0];
const context=Function("const dirs=['left','up','right','down'];\n"+['slide','quality','search','choose'].map(extract).join('\n')+'\nreturn {slide,choose};')();
const count=Number(process.env.GAMES||6),budget=Number(process.env.BUDGET||12);
const log=value=>{const line=JSON.stringify(value);console.log(line);if(process.env.RESULTS)fs.appendFileSync(process.env.RESULTS,line+'\n');};
function rng(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
for(const mode of (process.env.MODE||'baseline,upgraded').split(',')){
  const results=[];
  for(let seed=1;seed<=count;seed++){
    const random=rng(seed),ai=createAI();let b=Array(16).fill(0),score=0,moves=0;const times=[];
    function spawn(){const e=b.map((v,i)=>v?-1:i).filter(i=>i>=0);b[e[Math.floor(random()*e.length)]]=random()<.9?2:4;}
    spawn();spawn();
    while(moves<20000){const start=performance.now();const d=mode==='baseline'?context.choose(b):ai.choose(b,budget);times.push(performance.now()-start);if(d===null)break;
      const n=context.slide(b,d);if(!n.changed)throw Error('Invalid AI move');b=n.board;score+=n.gain;spawn();moves++;
    }
    times.sort((a,b)=>a-b);const result={mode,seed,score,max:Math.max(...b),moves,meanMs:times.reduce((a,b)=>a+b,0)/times.length,p95Ms:times[Math.floor(times.length*.95)],maxMs:times.at(-1)};results.push(result);log(result);
  }
  log({mode,games:count,averageScore:results.reduce((s,r)=>s+r.score,0)/count,reached2048:results.filter(r=>r.max>=2048).length,reached4096:results.filter(r=>r.max>=4096).length});
}
