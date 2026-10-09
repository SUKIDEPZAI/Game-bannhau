// Quét tham số (minCutoff, beta, dCutoff) → Pareto: jitter khi đứng yên (tip rms) vs lỗi khi chuyển động (sine+fastrev+stop, 60 & 30 fps).
import { SmoothSet } from "../public/js/smoothing.js";
import { FILTER } from "../public/js/config.js";
import { SCEN, run, rms, std } from "./sim.js";
const ev = (mc, b, dc) => { const mk = () => new SmoothSet(21, { ...FILTER.hand, minCutoff: mc, beta: b, dCutoff: dc, maxH: FILTER.maxHorizon }); let mv = 0, n = 0;
  for (const fps of [30, 60]) for (const sc of ["sine", "fastrev", "stop", "const"]) { const o = run(null, mk, SCEN[sc], { fps }); mv += rms(o.err.map((e) => e[0]).slice(40)); n++; }
  let rj = 0; for (const fps of [30, 60, 120]) { const o = run(null, mk, SCEN.rest, { fps, noise: 0.002 }); rj += std(o.tip.slice(40)); }
  return { move: mv / n, rest: rj / 3 }; };
const rows = []; for (const mc of [1.2, 1.6, 2.2, 3, 4]) for (const b of [40, 60, 90, 130]) for (const dc of [4, 6, 9]) rows.push({ mc, b, dc, ...ev(mc, b, dc) });
const front = rows.filter((r) => !rows.some((q) => q !== r && q.move <= r.move && q.rest <= r.rest && (q.move < r.move || q.rest < r.rest))).sort((a, b) => a.rest - b.rest);
console.log("Pareto front (rest = jitter đầu ngón khi đứng yên, move = lỗi rms khi chuyển động; đơn vị hand-size)");
for (const r of front) console.log(`minCutoff ${r.mc} beta ${String(r.b).padStart(3)} dCutoff ${r.dc} | rest ${r.rest.toFixed(4)} | move ${r.move.toFixed(4)}`);
const cur = rows.find((r) => r.mc === 2.2 && r.b === 60 && r.dc === 6); console.log(`\nHIỆN TẠI  minCutoff 2.2 beta 60 dCutoff 6 | rest ${cur.rest.toFixed(4)} | move ${cur.move.toFixed(4)}`);
