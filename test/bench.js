// Benchmark A/B trên cùng dữ liệu mô phỏng: bản cũ (v12) vs mới (v13) + So sánh bộ lọc 1D (One Euro / Alpha-Beta / Kalman CV).
import { SmoothSet as New } from "../public/js/smoothing.js";
import { SmoothSet as Old } from "./legacy-smoothing.js";
import { FILTER } from "../public/js/config.js";
import { SCEN, run, rms, std, SCALE, mulberry, gauss } from "./sim.js";
const mkNew = () => new New(21, { ...FILTER.hand, maxH: FILTER.maxHorizon });
const mkOld = () => { const s = new Old(21, { minCutoff: 2.2, beta: 60, tau: 0.006 }); s.lead = 0.004; return s; };
const f2 = (v) => v.toFixed(3).padStart(7);
const cases = [["rest", {}], ["const", {}], ["sine", {}], ["stop", {}], ["fastrev", {}]];
export const results = {};
console.log("== A. Sai lệch hiển thị so với khung video đang hiện (đơn vị: kích thước bàn tay; càng nhỏ càng tốt) ==");
console.log("fps  scenario   |  v12 rms  v13 rms | v12 tipRms v13 tipRms | v12 max  v13 max");
for (const fps of [30, 60, 120]) for (const [name] of cases) {
  const row = []; for (const [tag, mk] of [["old", mkOld], ["new", mkNew]]) {
    const o = run(null, mk, SCEN[name], { fps }); const ex = o.err.map((e) => e[0]).slice(30);
    row.push({ rms: name === "rest" ? std(ex) : rms(ex), tip: rms(o.tip.slice(30)), max: Math.max(...ex.map(Math.abs)) });
  }
  results[`${fps}/${name}`] = row;
  console.log(`${String(fps).padStart(3)}  ${name.padEnd(10)} |${f2(row[0].rms)} ${f2(row[1].rms)}  |${f2(row[0].tip)}   ${f2(row[1].tip)}   |${f2(row[0].max)} ${f2(row[1].max)}`);
}
console.log("\n== B. Overshoot khi dừng đột ngột (tay chạy 1.2/s rồi đứng; vượt quá vị trí dừng, đơn vị hand-size) ==");
for (const fps of [30, 60, 120]) { const r = []; for (const mk of [mkOld, mkNew]) { const o = run(null, mk, SCEN.stop, { fps }); const stopX = 0.92; r.push(Math.max(0, Math.max(...o.pos) - stopX) / SCALE); } console.log(`fps ${fps}: v12 ${f2(r[0])} · v13 ${f2(r[1])}`); }
console.log("\n== C. Outlier (1 đầu ngón nhảy +0.2 trong 1 khung) — độ lệch tối đa của đầu ngón ==");
for (const [tag, mk] of [["v12", mkOld], ["v13", mkNew]]) { const o = run(null, mk, SCEN.rest, { spike: { t: 1000, mag: 0.2 } }); console.log(`${tag}: ${f2(Math.max(...o.tip.slice(30)))}`); }
console.log("\n== D. Mất khung 400ms rồi tay xuất hiện lại cách 0.12 — bước nhảy lớn nhất giữa 2 lần vẽ (teleport) ==");
for (const [tag, mk] of [["v12", mkOld], ["v13", mkNew]]) { const o = run(null, mk, (t) => [0.4 + (t > 1.2 ? 0.12 : 0), 0.6], { gap: [800, 1200] }); console.log(`${tag}: ${f2(Math.max(...o.jump) )} hand-size/lần vẽ`); }
console.log("\n== E. Màn hình 144Hz, camera 60fps (render độc lập inference) — rms sine ==");
for (const [tag, mk] of [["v12", mkOld], ["v13", mkNew]]) { const o = run(null, mk, SCEN.sine, { fps: 60, hz: 144 }); console.log(`${tag}: ${f2(rms(o.err.map((e) => e[0]).slice(60)))}`); }

// ---- F. Filter 1D A/B (cùng tín hiệu: nhiễu σ=0.002, 60 fps) ----
class OE { constructor(mc, b, dc) { Object.assign(this, { mc, b, dc, has: 0 }); } f(x, dt) { const a = (c) => { const r = 6.2832 * c * dt; return r / (1 + r); }; if (!this.has) { this.has = 1; this.x = this.r = x; this.dx = 0; return x; } const d = (x - this.r) / dt; this.r = x; this.dx += a(this.dc) * (d - this.dx); this.x += a(this.mc + this.b * Math.abs(this.dx)) * (x - this.x); return this.x; } }
class AB { constructor(a, b) { Object.assign(this, { a, b, has: 0 }); } f(x, dt) { if (!this.has) { this.has = 1; this.x = x; this.v = 0; return x; } const p = this.x + this.v * dt, r = x - p; this.x = p + this.a * r; this.v += this.b * r / dt; return this.x; } }
class KCV { constructor(q, r) { Object.assign(this, { q, r, has: 0 }); } f(z, dt) { if (!this.has) { this.has = 1; this.x = z; this.v = 0; this.P = [1, 0, 0, 1]; return z; } const q = this.q; let [a, b, c, d] = this.P; const x = this.x + this.v * dt; const A = a + dt * (b + c) + dt * dt * d + q * dt ** 3 / 3, B = b + dt * d + q * dt * dt / 2, C = c + dt * d + q * dt * dt / 2, D = d + q * dt; const S = A + this.r, k0 = A / S, k1 = C / S, y = z - x; this.x = x + k0 * y; this.v += k1 * y; this.P = [(1 - k0) * A, (1 - k0) * B, C - k1 * A, D - k1 * B]; return this.x; } }
const sig = { rest: () => 0.5, const: (t) => 0.5 * t, stop: (t) => t < 0.6 ? 1.2 * t : 0.72, rev: (t) => 0.2 * Math.sin(6.2832 * t) };
function f1d(mk, name) { const rnd = mulberry(3), f = mk(), dt = 1 / 60, y = []; for (let t = 0, i = 0; t < 2.5; t += dt, i++) { const o = f.f(sig[name](t) + gauss(rnd) * 0.002, dt); y.push([o, sig[name](t)]); } return y.slice(30); }
console.log("\n== F. So sánh bộ lọc 1D (60fps, σ=0.002) — jitter@rest(×1e3) · lag@const(ms) · overshoot@stop(×1e3) · rms@reversal(×1e3) ==");
const FS = { OneEuro_v13: () => new OE(2.2, 60 * 1, 6), AlphaBeta: () => new AB(0.5, 0.1), Kalman_CV: () => new KCV(40, 4e-6), OneEuro_hiBeta: () => new OE(1.5, 120, 6) };
for (const [n, mk] of Object.entries(FS)) { const rest = f1d(mk, "rest"), cv = f1d(mk, "const"), st = f1d(mk, "stop"), rv = f1d(mk, "rev"); const lag = (cv.reduce((s, [o, t]) => s + (t - o), 0) / cv.length) / 0.5 * 1000; const ov = Math.max(0, Math.max(...st.map(([o]) => o)) - 0.72); const t0 = performance.now(); const ff = mk(); for (let i = 0; i < 2e5; i++) ff.f(Math.sin(i), 1 / 60); const cpu = (performance.now() - t0) / 2e5 * 1e6;
  console.log(`${n.padEnd(15)} jitter ${(std(rest.map((p) => p[0])) * 1e3).toFixed(2)} · lag ${lag.toFixed(1)}ms · overshoot ${(ov * 1e3).toFixed(2)} · rev ${(rms(rv.map(([o, t]) => o - t)) * 1e3).toFixed(2)} · ${cpu.toFixed(0)} ns/call`); }
