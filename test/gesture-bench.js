import { performance } from 'node:perf_hooks';
import { GestureTracker } from '../public/js/gesture.js';

// Benchmarks only the deterministic JS pose-decision stage, not camera/model inference.
const set = { x: new Float32Array(42) };
const pts = Array.from({ length: 21 }, () => ({ x: .5, y: .5 }));
const wrist = { x: .5, y: .82 }; pts[0] = wrist;
const mcpX = [-.09, -.04, .015, .06], mcpY = [-.1, -.12, -.105, -.08], ids = [5,9,13,17];
for (let f=0; f<4; f++) {
  const b={x:.5+mcpX[f],y:.82+mcpY[f]}; pts[ids[f]]=b;
  pts[ids[f]+1]={x:b.x,y:b.y-.045}; pts[ids[f]+2]={x:b.x,y:b.y-.075}; pts[ids[f]+3]={x:b.x,y:b.y-.105};
}
pts[1]={x:.46,y:.78}; pts[2]={x:.43,y:.74}; pts[3]={x:.40,y:.70}; pts[4]={x:.36,y:.67};
pts.forEach((p,i)=>{set.x[i*2]=p.x;set.x[i*2+1]=p.y;});
const g = new GestureTracker();
let t=0;
for (let i=0;i<20000;i++) { g.update(set, 1.7778, t+=16, .3, true); }
const batchSize = 20, batchCount = 6000;
const samples = new Float64Array(batchCount);
for (let i=0;i<batchCount;i++) {
  const a=performance.now();
  for (let j=0;j<batchSize;j++) {
    const k=i*batchSize+j, wobble=Math.sin(k*.071)*.0007;
    set.x[16*2] = pts[16].x + wobble; set.x[16*2+1] = pts[16].y - wobble*.4;
    set.x[20*2] = pts[20].x - wobble*.7; set.x[20*2+1] = pts[20].y + wobble*.3;
    g.update(set,1.7778,t+=16,.3+(k%9)*.015,true);
  }
  samples[i]=(performance.now()-a)/batchSize;
}
const sorted=Array.from(samples).sort((a,b)=>a-b);
const q=(p)=>sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))];
console.log(JSON.stringify({stage:'GestureTracker.update only',runtime:process.version,samples:batchCount*batchSize,unit:'ms per call',p50:+q(.50).toFixed(5),p95:+q(.95).toFixed(5),p99:+q(.99).toFixed(5),max:+sorted.at(-1).toFixed(5),note:'Each sample averages 20 jittered landmark updates; Node microbenchmark only. Browser/Android requires live-device measurement.'},null,2));
