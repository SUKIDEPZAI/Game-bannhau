// Gán ID ổn định bằng greedy nearest-neighbour (chuẩn hoá theo kích thước người).
import { L, ok, mid } from "./angleUtils.js";
import { LandmarkSmoother } from "./smoothing.js";
import { makeCounters } from "./repCounter.js";

const centerOf = (m) => {
  const p = [m[L.ls], m[L.rs], m[L.lh], m[L.rh]].filter(ok);
  return p.length ? { x: p.reduce((s, q) => s + q.x, 0) / p.length, y: p.reduce((s, q) => s + q.y, 0) / p.length } : null;
};
const sizeOf = (m) => Math.max(0.1, Math.hypot(...[0, 1].map((k) => { const s = mid(m[L.ls], m[L.rs]), h = mid(m[L.lh], m[L.rh]); return k ? s.y - h.y : s.x - h.x; })));

export class Tracker {
  constructor() { this.tracks = new Map(); this.nextId = 1; }
  resetReps() { for (const t of this.tracks.values()) { for (const c of Object.values(t.reps)) c.reset(); t.fb = ""; } }

  update(dets, now) {
    const ds = dets.map((lm, i) => ({ i, lm, c: centerOf(lm), s: sizeOf(lm) })).filter((d) => d.c);
    const pairs = [];
    for (const t of this.tracks.values()) for (const d of ds)
      pairs.push({ t, d, cost: Math.hypot(d.c.x - t.c.x, d.c.y - t.c.y) / Math.max(t.s, d.s) });
    pairs.sort((a, b) => a.cost - b.cost);
    const usedT = new Set(), usedD = new Set();
    for (const { t, d, cost } of pairs) {
      if (cost > 1.65 || usedT.has(t) || usedD.has(d.i)) continue;
      usedT.add(t); usedD.add(d.i); this.assign(t, d, now);
    }
    for (const d of ds) if (!usedD.has(d.i)) {
      const t = { id: this.nextId++, c: d.c, s: d.s, missed: 0, smoother: new LandmarkSmoother(), reps: makeCounters(),
        trail: [], action: "Đứng", cand: "", candN: 0, fb: "", fbUntil: 0, warnUntil: 0, quality: 1, lm: null, ang: null };
      this.tracks.set(t.id, t); this.assign(t, d, now);
    }
    const live = [];
    for (const [id, t] of this.tracks) {
      if (!usedT.has(t) && t.lm && t.missed >= 0 && !t.fresh) t.missed++;
      if (t.missed > 15) { this.tracks.delete(id); continue; }
      if (t.missed === 0) live.push(t);
      t.fresh = false;
    }
    return live;
  }

  assign(t, d, now) {
    t.c = d.c; t.s = d.s; t.missed = 0; t.fresh = true;
    t.lm = t.smoother.apply(d.lm, now);
    t.quality = d.lm.reduce((s, p) => s + (p.visibility ?? 1), 0) / d.lm.length;
    t.trail.push([t.lm[L.lw].x, t.lm[L.lw].y, t.lm[L.rw].x, t.lm[L.rw].y]);
    if (t.trail.length > 14) t.trail.shift();
  }
}
