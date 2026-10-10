import test from "node:test";
import assert from "node:assert/strict";
import { SmoothSet } from "../public/js/smoothing.js";
import { Metric } from "../public/js/telemetry.js";
import { PerfController } from "../public/js/perf.js";
import { Interact } from "../public/js/interact.js";
import { FILTER, PERF, INTERACT } from "../public/js/config.js";
import { hand } from "./sim.js";

test("SmoothSet.reset clears old timestamps, motion and visible points", () => {
  const s = new SmoothSet(21, { ...FILTER.hand, maxH: FILTER.maxHorizon });
  s.push(hand(.5, .5), 100, 90); s.step(.016, true, 116);
  assert.equal(s.has, true); assert.equal(s.tAge, 90);
  s.reset();
  assert.equal(s.has, false); assert.equal(s.last, 0); assert.equal(s.tAge, 0);
  assert.equal(s.alpha, 0); assert.equal(s.miss, 99); assert.equal(s.gain, 0);
  for (const k of ["x", "v", "d", "r", "pv", "pvp", "pp"]) assert.ok(s[k].every((v) => v === 0), `${k} not cleared`);
});

test("Metric.reset removes old samples from percentile stats", () => {
  const m = new Metric(4); [10, 20, 30].forEach((v) => m.push(v));
  assert.equal(m.stats().max, 30); m.reset();
  assert.equal(m.n, 0); assert.equal(m.stats().max, 0); assert.equal(m.stats().p95, 0);
});

test("PerfController.reset restores baseline and clears hysteresis", () => {
  const p = new PerfController(PERF); p.level = 2; p.badSince = 100; p.goodSince = 200; p.reset(500);
  assert.equal(p.level, 0); assert.equal(p.badSince, 0); assert.equal(p.goodSince, 0); assert.equal(p.lastChange, 500);
});

test("Interact.clearVisuals removes stale hover/press/progress on camera stop", () => {
  const btn = { cls: new Set(["kb-hover", "kb-press"]), vars: { "--p": "0.8" }, classList: { add(c) { btn.cls.add(c); }, remove(...cs) { cs.forEach((c) => btn.cls.delete(c)); } }, style: { setProperty(k, v) { btn.vars[k] = v; } }, disabled: false, getBoundingClientRect() { return { left: 250, top: 190, right: 310, bottom: 250, width: 60, height: 60 }; } };
  const cv = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }) };
  const ui = new Interact(cv, { ...INTERACT }, () => [btn]);
  const slot = { set: { ui: { x: new Float32Array(5).fill(12), y: new Float32Array(5).fill(13), t0: new Float64Array(5).fill(100), prog: new Float32Array(5).fill(1), hov: new Uint8Array(5).fill(1), fired: new Uint8Array(5).fill(1), tgt: [btn, btn, btn, btn, btn], valid: true, pinch: true, flash: 120 } } };
  ui.rects.push({ el: btn }); ui.hov.push(btn); ui.prevHov.push(btn);
  ui.clearVisuals([slot]);
  assert.equal(btn.cls.has("kb-hover"), false); assert.equal(btn.cls.has("kb-press"), false);
  assert.equal(btn.vars["--p"], "0"); assert.equal(ui.rects.length, 0); assert.equal(ui.hov.length, 0); assert.equal(ui.prevHov.length, 0);
  assert.equal(slot.set.ui.valid, false); assert.equal(slot.set.ui.pinch, false); assert.ok(slot.set.ui.x.every((v) => v === 0)); assert.ok(slot.set.ui.tgt.every((v) => v === null));
});
