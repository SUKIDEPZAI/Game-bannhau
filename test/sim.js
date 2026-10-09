// Mô phỏng xác định (PRNG seed): bàn tay cứng 21 điểm chuyển động theo quỹ đạo, camera trễ, AI trễ, render 60/144Hz.
export const mulberry = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
export const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(6.2832 * r());
const R = mulberry(7);
export const OFFS = Array.from({ length: 21 }, (_, i) => i === 0 ? [0, 0] : [(R() - .5) * .12, -0.15 - (R()) * .12]);
OFFS[9] = [0, -0.15];
export const SCALE = 0.15;
export const hand = (px, py) => OFFS.map(([ox, oy]) => ({ x: px + ox, y: py + oy }));
export const palm = (lm, A = [0, 5, 9, 13, 17]) => [A.reduce((s, a) => s + lm[a].x, 0) / 5, A.reduce((s, a) => s + lm[a].y, 0) / 5];
export const SCEN = {
  rest:   (t) => [0.5, 0.6],
  const:  (t) => [0.2 + 0.5 * t, 0.6],
  sine:   (t) => [0.5 + 0.2 * Math.sin(6.2832 * 1.0 * t), 0.6],
  stop:   (t) => [0.2 + (t < 0.6 ? 1.2 * t : 0.72), 0.6],
  fastrev:(t) => [0.5 + 0.15 * Math.sin(6.2832 * 2.5 * t), 0.6]
};
// run: trả về chuỗi lỗi hiển thị (đơn vị = số lần kích thước bàn tay) so với khung video đang hiển thị.
export function run(Set, mk, path, { fps = 60, hz = 60, camLat = 40, ai = 8, noise = 0.002, dur = 2.5, spike = null, gap = null, seed = 1 } = {}) {
  const rnd = mulberry(seed), set = mk(), fi = 1000 / fps, ri = 1000 / hz, ev = [], out = { err: [], pos: [], t: [], jump: [] };
  for (let k = 0; k * fi < dur * 1000; k++) {
    const tc = k * fi; if (gap && tc > gap[0] && tc < gap[1]) continue;
    const [x, y] = path(tc / 1000), lm = hand(x, y).map((p) => ({ x: p.x + gauss(rnd) * noise, y: p.y + gauss(rnd) * noise }));
    if (spike && Math.abs(tc - spike.t) < fi / 2) { lm[8].x += spike.mag; lm[8].y += spike.mag; }
    ev.push({ arr: tc + camLat + ai, tc, tp: tc + camLat, lm, truth: [x, y] });
  }
  let e = 0, last = 0, prev = null;
  for (let t = 0; t < dur * 1000; t += ri) {
    while (e < ev.length && ev[e].arr <= t) { set.push(ev[e].lm, ev[e].tc, ev[e].tp); set.miss = 0; e++; }
    set.step(Math.min(0.1, (t - last) / 1000 || ri / 1000), true, t); last = t;
    if (!set.has) continue;
    const ref = path(Math.max(0, Math.floor((t - camLat) / fi) * fi) / 1000), lm = hand(ref[0], ref[1]);
    const d = []; for (let i = 0; i < 21; i++) d.push({ x: set.d[i * 2], y: set.d[i * 2 + 1] });
    const dp = palm(d), rp = palm(lm);
    out.err.push([(dp[0] - rp[0]) / SCALE, (dp[1] - rp[1]) / SCALE]); out.pos.push(dp[0]); out.t.push(t);
    const fe = Math.hypot(d[8].x - lm[8].x, d[8].y - lm[8].y) / SCALE; (out.tip ??= []).push(fe);
    if (prev) out.jump.push(Math.hypot(dp[0] - prev[0], dp[1] - prev[1]) / SCALE); prev = dp;
  }
  return out;
}
export const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / (a.length || 1));
export const std = (a) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
