import test from "node:test";
import assert from "node:assert/strict";
import { SmoothSet } from "../public/js/smoothing.js";
import { GestureTracker, SwipeDetector } from "../public/js/gesture.js";
import { pickAssignment } from "../public/js/tracking.js";
import { PerfController } from "../public/js/perf.js";
import { Metric } from "../public/js/telemetry.js";
import { FILTER, TRACK, PERF, RENDER_URL } from "../public/js/config.js";
import { hand, run, SCEN, mulberry, gauss, SCALE, palm } from "./sim.js";

const mk = () => new SmoothSet(21, { ...FILTER.hand, maxH: FILTER.maxHorizon });
// ---- pose giả cho cử chỉ (y hướng xuống, ngón hướng lên = y giảm) ----
function pose({ ext = [1, 1, 1, 1], thumb = 1, pinch = false } = {}) {
  const L = Array.from({ length: 21 }, () => ({ x: 0, y: 0 })), W = { x: .5, y: .8 }, mcp = [[-.04, -.10], [0, -.11], [.04, -.10], [.075, -.085]];
  L[0] = W; [5, 9, 13, 17].forEach((id, f) => { const b = { x: W.x + mcp[f][0], y: W.y + mcp[f][1] }; L[id] = b;
    if (ext[f]) { L[id + 1] = { x: b.x, y: b.y - .045 }; L[id + 2] = { x: b.x, y: b.y - .075 }; L[id + 3] = { x: b.x, y: b.y - .10 }; }
    else { L[id + 1] = { x: b.x, y: b.y - .035 }; L[id + 2] = { x: b.x, y: b.y - .005 }; L[id + 3] = { x: b.x + .005, y: b.y + .025 }; } });
  L[1] = { x: .47, y: .77 }; L[2] = { x: .44, y: .73 };
  if (thumb) { L[3] = { x: .41, y: .69 }; L[4] = { x: .37, y: .66 }; } else { L[3] = { x: .46, y: .70 }; L[4] = { x: .50, y: .745 }; }
  if (pinch) { L[4] = { x: L[8].x + .004, y: L[8].y + .004 }; L[3] = { x: L[4].x - .02, y: L[4].y + .03 }; }
  return L;
}
const asSet = (L) => { const x = new Float32Array(42); L.forEach((p, i) => { x[i * 2] = p.x; x[i * 2 + 1] = p.y; }); return { x }; };
const settle = (g, L, t0 = 0, ms = 400) => { let l = ""; for (let t = t0; t <= t0 + ms; t += 16) l = g.update(asSet(L), 1, t, 0.3, true); return l; };

test("config: URL Render đã nhập", () => assert.equal(RENDER_URL, "https://game-bannhau.onrender.com"));

test("cử chỉ tĩnh giữ nguyên bộ nhãn cũ", () => {
  const cases = [[{}, "Mở bàn tay"], [{ thumb: 0 }, "4 ngón"], [{ ext: [0, 0, 0, 0], thumb: 0 }, "Nắm đấm"], [{ ext: [0, 0, 0, 0], thumb: 1 }, "Like"],
    [{ ext: [1, 0, 0, 0], thumb: 0 }, "Chỉ tay"], [{ ext: [1, 1, 0, 0], thumb: 0 }, "Chữ V"], [{ ext: [0, 1, 1, 1], thumb: 0 }, "OK"], [{ pinch: true, thumb: 0 }, "Pinch"]];
  for (const [p, want] of cases) assert.equal(settle(new GestureTracker(), pose(p)), want, JSON.stringify(p));
});
test("hysteresis: nhiễu quanh ngưỡng không làm nhãn nhấp nháy", () => {
  const g = new GestureTracker(), r = mulberry(5); settle(g, pose({ ext: [1, 1, 1, 1], thumb: 0 })); let flips = 0, prev = g.label;
  for (let t = 500; t < 5500; t += 16) { const L = pose({ ext: [1, 1, 1, 1], thumb: 0 }); const k = 1 - 0.1 + (r() - .5) * .04; L[8].y = L[5].y - .10 * k; const l = g.update(asSet(L), 1, t, 0.3, true); if (l !== prev) flips++; prev = l; }
  assert.ok(flips <= 1, `flips=${flips}`);
});
test("nhãn mới cần giữ đủ ms; tay nhanh xác nhận sớm hơn tay đứng yên", () => {
  const conf = (speed) => { const g = new GestureTracker(); settle(g, pose({ ext: [1, 1, 1, 1], thumb: 0 })); const F = pose({ ext: [0, 0, 0, 0], thumb: 0 }); for (let t = 1000; t < 1400; t += 8) if (g.update(asSet(F), 1, t, speed, true) === "Nắm đấm") return t - 1000; return 1e9; };
  const fast = conf(2), still = conf(0.01); assert.ok(fast < still && fast >= 40 && still >= 130, `fast=${fast} still=${still}`);
  const g = new GestureTracker(); settle(g, pose()); g.update(asSet(pose({ ext: [0, 0, 0, 0], thumb: 0 })), 1, 1000, 0.3, true); assert.equal(g.label, "Mở bàn tay");   // 1 khung nhiễu không đổi nhãn
});
test("chất lượng kém (ok=false) → giữ nhãn cũ, không nhảy", () => { const g = new GestureTracker(); settle(g, pose()); for (let t = 600; t < 900; t += 16) g.update(asSet(pose({ ext: [0, 0, 0, 0], thumb: 0 })), 1, t, 0.3, false); assert.equal(g.label, "Mở bàn tay"); });

test("swipe nhanh được nhận; trôi chậm / lắc không bị nhận nhầm", () => {
  const sw = new SwipeDetector(); let got = ""; for (let t = 0; t < 300; t += 16) got = sw.push(t, 0.3 + t / 1000 * 1.6, 0.5, 0.15) || got; assert.equal(got, "R");
  const s2 = new SwipeDetector(); let any = ""; for (let t = 0; t < 3000; t += 16) any = s2.push(t, 0.3 + t / 1000 * 0.1, 0.5, 0.15) || any; assert.equal(any, "");
  const s3 = new SwipeDetector(); any = ""; for (let t = 0; t < 3000; t += 16) any = s3.push(t, 0.5 + 0.08 * Math.sin(t / 1000 * 6.2832 * 3), 0.5, 0.15) || any; assert.equal(any, "", "lắc ≠ swipe");
  const s4 = new SwipeDetector(); let n = 0; for (let t = 0; t < 1200; t += 16) if (s4.push(t, 0.1 + t / 1000 * 1.6, 0.5, 0.15)) n++; assert.ok(n <= 2, `cooldown n=${n}`);
});
test("swipe độc lập FPS (24/30/60/120)", () => { for (const fps of [24, 30, 60, 120]) { const sw = new SwipeDetector(64); let got = ""; for (let t = 0; t < 320; t += 1000 / fps) got = sw.push(t, 0.3 + t / 1000 * 1.6, 0.5, 0.15) || got; assert.equal(got, "R", `fps ${fps}`); } });

test("hai tay GIAO NHAU: không hoán đổi danh tính (thứ tự detection ngẫu nhiên)", () => {
  const sets = [mk(), mk()], r = mulberry(11), fi = 1000 / 30, map = {}; let swaps = 0;
  const pos = (id, t) => id === 0 ? [0.25 + 0.5 * t, 0.55 + 0.02 * Math.sin(t * 3)] : [0.75 - 0.5 * t, 0.55 - 0.02 * Math.sin(t * 3)];
  for (let k = 0; k < 60; k++) {
    const tc = k * fi, t = tc / 1000, H = new Float32Array(126), L = [pos(0, t), pos(1, t)].map(([x, y]) => hand(x, y));
    const order = r() < .5 ? [0, 1] : [1, 0]; order.forEach((id, i) => L[id].forEach((p, j) => { H[i * 63 + j * 3] = p.x + gauss(r) * .002; H[i * 63 + j * 3 + 1] = p.y + gauss(r) * .002; }));
    const dets = [0, 63], pick = pickAssignment(dets, H, sets, 16 / 9, tc, TRACK);
    dets.forEach((o, i) => { const id = order[i]; if (k === 0) map[id] = pick[i]; else if (pick[i] !== map[id]) swaps++; sets[pick[i]].pushPacked(H, o, tc, tc); });
  }
  assert.equal(swaps, 0, `swaps=${swaps}`);
});
test("gating: tay mới ở xa không cướp track cũ", () => {
  const sets = [mk(), mk()]; const H = new Float32Array(63); hand(.2, .6).forEach((p, j) => { H[j * 3] = p.x; H[j * 3 + 1] = p.y; }); sets[0].pushPacked(H, 0, 0, 0);
  const H2 = new Float32Array(63); hand(.9, .3).forEach((p, j) => { H2[j * 3] = p.x; H2[j * 3 + 1] = p.y; });
  assert.deepEqual(pickAssignment([0], H2, sets, 16 / 9, 33, TRACK), [1]);
});

test("failure injection: không NaN, không nổ, dự đoán bị chặn", () => {
  const o = run(null, mk, SCEN.sine, { spike: { t: 800, mag: 0.4 }, gap: [1200, 1500], noise: 0.004 });
  assert.ok(o.err.every((e) => Number.isFinite(e[0]) && Math.abs(e[0]) < 1.5), "err bounded"); assert.ok(Math.max(...o.jump) < 0.45, `jump ${Math.max(...o.jump)}`);
  const s = mk(), L = hand(.5, .5); for (let t = 0; t < 500; t += 16) { L.forEach((p) => p.x += 0.01); s.push(L, t); s.step(.016, true, t); }
  for (let t = 500; t < 1500; t += 16) s.step(.016, true, t);   // mất khung hoàn toàn 1s: dự đoán phải suy giảm về 0
  assert.ok(s.gain < 1e-3, `gain ${s.gain}`); assert.ok(s.d.every(Number.isFinite));
});
test("FPS 24/30/60/90/120: lỗi hiển thị trong ngưỡng, độc lập tần số", () => { for (const fps of [24, 30, 60, 90, 120]) { const o = run(null, mk, SCEN.const, { fps }); const e = Math.sqrt(o.err.slice(40).reduce((s, v) => s + v[0] ** 2, 0) / o.err.slice(40).length); assert.ok(e < 0.12, `fps ${fps} rms ${e}`); } });
test("reacquire: hiển thị trượt có giới hạn, không teleport", () => { const o = run(null, mk, (t) => [0.4 + (t > 1.2 ? .12 : 0), .6], { gap: [800, 1200] }); assert.ok(Math.max(...o.jump) < 0.3, `${Math.max(...o.jump)}`); });
test("đứng yên: rung hiển thị ≤ 0.01 kích thước tay", () => { const o = run(null, mk, SCEN.rest, { noise: 0.002 }); const a = o.err.slice(40).map((e) => e[0]), m = a.reduce((s, v) => s + v, 0) / a.length; assert.ok(Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length) < 0.01); });

test("replay xác định: cùng input → cùng output từng bit", () => {
  const go = () => { const o = run(null, mk, SCEN.fastrev, { seed: 9, spike: { t: 700, mag: .1 } }); return o.pos.join(","); };
  assert.equal(go(), go());
});
test("PerfController: hạ cấp khi quá tải kéo dài, không dao động, phục hồi chậm", () => {
  const p = new PerfController(PERF); const hot = { aiP95: 40, ageP95: 100, renderP95: 9 }, cool = { aiP95: 5, ageP95: 30, renderP95: 1 }; let ch = []; let t = 0;
  for (; t < 20000; t += 500) { const l = p.update(t, hot); if (l !== null) ch.push([t, l]); }
  assert.ok(ch.length >= 1 && ch.length <= 3 && ch[0][0] >= PERF.degradeAfterMs, JSON.stringify(ch)); ch.forEach((c, i) => i && assert.ok(c[0] - ch[i - 1][0] >= PERF.cooldownMs));
  const up = []; for (; t < 60000; t += 500) { const l = p.update(t, cool); if (l !== null) up.push([t, l]); } assert.equal(p.level, 0); assert.ok(up[0][0] - 20000 >= PERF.recoverAfterMs);
  const q = new PerfController(PERF); let flips = 0, last = 0; for (let t2 = 0; t2 < 60000; t2 += 500) { const l = q.update(t2, t2 % 2000 < 1000 ? hot : cool); if (l !== null) { flips++; last = l; } } assert.ok(flips <= 2, `flips ${flips}`);
});
test("Metric: percentile đúng", () => { const m = new Metric(100); for (let i = 1; i <= 100; i++) m.push(i); const s = m.stats(); assert.equal(s.max, 100); assert.ok(Math.abs(s.p50 - 50) <= 1 && Math.abs(s.p95 - 95) <= 1 && Math.abs(s.p99 - 99) <= 1); });

// ================= v14: tương tác đầu ngón + renderer =================
import { Interact } from "../public/js/interact.js";
import { Renderer, STYLES } from "../public/js/renderer.js";
import { INTERACT } from "../public/js/config.js";
const mkBtn = (l, t, w = 60, h = 60) => { const e = { clicked: 0, disabled: false, cls: new Set(), vars: {}, classList: { add: (c) => e.cls.add(c), remove: (c) => e.cls.delete(c) }, style: { setProperty: (k, v) => (e.vars[k] = v) }, click: () => e.clicked++, getBoundingClientRect: () => ({ left: l, top: t, right: l + w, bottom: t + h, width: w, height: h }) }; return e; };
const mkUI = (btns, rect = { left: 0, top: 0, width: 960, height: 540 }) => new Interact({ getBoundingClientRect: () => rect }, { ...INTERACT }, () => btns);
const mkSlot = (ext = [1, 0, 0, 0], thumb = 0, label = "Chỉ tay") => ({ set: { d: new Float32Array(42) }, vis: true, g: { ext, thumb }, label });
const setTip = (s, i, px, py, vw = 960, vh = 540) => { s.set.d[i * 2] = px / vw; s.set.d[i * 2 + 1] = py / vh; };
const sim = (ui, slot, ms, fn = null, mirrored = false, t0 = 1000) => { let t = t0; for (; t < t0 + ms; t += 16) { fn?.(t - t0); ui.update(t, [slot], mirrored, 960, 540); } return t; };

test("tương tác: CHỈ TAY giữ yên ~0.7s → bấm đúng 1 lần (có cooldown), không bấm sớm", () => {
  const b = mkBtn(250, 190), ui = mkUI([b]), s = mkSlot(); setTip(s, 8, 280, 220); let first = -1;
  sim(ui, s, 3000, (ms) => { if (b.clicked && first < 0) first = ms; });
  assert.equal(b.clicked, 1); assert.ok(first >= 650 && first <= 800, `first=${first}`);
});
test("tương tác: bàn tay XÒE (5 ngón) chỉ hover, không bấm", () => {
  const b = mkBtn(250, 190), ui = mkUI([b]), s = mkSlot([1, 1, 1, 1], 1, "Mở bàn tay"); setTip(s, 8, 280, 220); sim(ui, s, 2500);
  assert.equal(b.clicked, 0); assert.ok(b.cls.has("kb-hover"));
});
test("tương tác: quét nhanh qua nút không bấm; hover bật rồi tắt khi tay rời", () => {
  const b = mkBtn(400, 200), ui = mkUI([b]), s = mkSlot(); sim(ui, s, 800, (ms) => setTip(s, 8, 100 + ms * 1.2, 230));   // ~1200 px/s
  assert.equal(b.clicked, 0, "không bấm"); s.vis = false; ui.update(5000, [s], false, 960, 540); ui.update(5016, [s], false, 960, 540); assert.ok(!b.cls.has("kb-hover"), "hover phải tắt");
});
test("tương tác: CHỤM (Pinch) bấm ngay ở giữa ngón cái + trỏ, giữ chụm không bấm lặp", () => {
  const b = mkBtn(250, 190), ui = mkUI([b]), s = mkSlot([1, 0, 0, 0], 0, ""); setTip(s, 4, 270, 215); setTip(s, 8, 290, 225); sim(ui, s, 200); assert.equal(b.clicked, 0);
  s.label = "Pinch"; sim(ui, s, 2500, null, false, 2000); assert.equal(b.clicked, 1);
});
test("tương tác: ánh xạ gương (mirror) và object-fit: cover đúng", () => {
  const L = mkBtn(228, 190), R = mkBtn(642, 190), ui = mkUI([L, R]), s = mkSlot([1, 1, 1, 1], 1); setTip(s, 8, 288, 220); sim(ui, s, 100, null, true);
  assert.ok(R.cls.has("kb-hover") && !L.cls.has("kb-hover"), "mirror: 288 → 672");
  const C = mkBtn(240, 450, 60, 60), ui2 = mkUI([C], { left: 0, top: 0, width: 540, height: 960 }), s2 = mkSlot([1, 1, 1, 1], 1); setTip(s2, 8, 480, 270); sim(ui2, s2, 100);   // tâm video → tâm màn dọc
  assert.ok(C.cls.has("kb-hover"), "cover: tâm → (270,480)");
});
test("tương tác: tắt (ui.on=false) thì không hover/bấm", () => { const b = mkBtn(250, 190), ui = mkUI([b]), s = mkSlot(); setTip(s, 8, 280, 220); ui.on = false; sim(ui, s, 2000); assert.equal(b.clicked, 0); assert.ok(!b.cls.has("kb-hover")); });

test("renderer: 4 phong cách chạy không lỗi, mỗi tay có 5 vòng tròn đầu ngón, không còn hàm vẽ đầu", () => {
  for (let st = 0; st < STYLES.length; st++) {
    let arcs = 0; const ctx = new Proxy({}, { get: (t, k) => k === "measureText" ? () => ({ width: 10 }) : (k in t ? t[k] : (...a) => { if (k === "arc") arcs++; }), set: (t, k, v) => (t[k] = v, true) });
    const r = new Renderer({ width: 960, height: 540, getContext: () => ctx }), L = hand(.5, .6), d = new Float32Array(42); L.forEach((p, i) => { d[i * 2] = p.x; d[i * 2 + 1] = p.y; });
    r.style = st; r.mirrored = true; r.fx = { glow: true, trail: true, text: true, lasers: true };
    const conn = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]].map(([start, end]) => ({ start, end }));
    const s = { d, alpha: 1, ui: { hov: new Uint8Array([0, 1, 0, 0, 0]), prog: new Float32Array([0, .5, 0, 0, 0]), flash: -1e9 } };
    r.hand(s, conn, "Chỉ tay", 1000); r.hand(s, conn, "Chỉ tay", 1020); r.lasers(s, s);
    assert.ok(arcs >= 10, `style ${STYLES[st]} arcs=${arcs}`);
  }
  assert.equal(typeof Renderer.prototype.head, "undefined");
});
