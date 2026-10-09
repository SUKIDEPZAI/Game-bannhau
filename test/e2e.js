// E2E giả lập trình duyệt: chạy NGUYÊN main.js với camera/Worker/canvas giả → kiểm tra skeleton có được VẼ không, FPS, lỗi runtime.
import { hand, mulberry, gauss } from "./sim.js";
export async function e2e({ still = false, aiMs = 8, pingOk = false, workerFailFirst = false, noPresented = false, secs = 2.5, camFps = 60 } = {}) {
  const log = { errors: [], draws: 0, arcs: 0, workers: [], raf: 0, text: {} }, g = globalThis;
  const ctx = new Proxy({}, { get: (t, k) => k === "measureText" ? () => ({ width: 10 }) : (k in t ? t[k] : (...a) => { if (k === "arc") log.arcs++; if (k === "stroke" || k === "fill") log.draws++; }), set: (t, k, v) => (t[k] = v, true) });
  const el = (id) => { const e = { id, textContent: "", style: { setProperty() {} }, width: 0, height: 0, classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle() {}, has(c) { return this._s.has(c); } }, setStyle() {}, click() { this.clicked = (this.clicked || 0) + 1; }, getBoundingClientRect() { return this.rect || { left: 0, top: 0, width: this.width || 960, height: this.height || 540, right: this.width || 960, bottom: this.height || 540 }; }, getContext: () => ctx, onclick: null, addEventListener() {} }; if (id === "overlay") Object.assign(e, { width: 960, height: 540 }); return e; };
  const els = {}, E = (id) => els[id] ??= el(id);
  let cb = null; const video = Object.assign(E("video"), { videoWidth: 960, videoHeight: 540, srcObject: null, play: async () => {}, requestVideoFrameCallback: (f) => { cb = f; } });
  Object.assign(g, { location: { hostname: "example.github.io", origin: "https://example.github.io" }, isSecureContext: true, addEventListener() {}, createImageBitmap: async () => ({ close() {} }),
    document: { querySelectorAll: () => (globalThis.__btns || []), getElementById: E, hidden: false, createElement: () => el("x"), documentElement: {}, fullscreenElement: null }, requestAnimationFrame: (f) => { log.raf++; return setTimeout(() => f(performance.now()), 1000 / 60); },
    fetch: async (u) => { if (!pingOk) throw new Error("offline"); if (String(u).includes("/ping")) return { ok: true, json: async () => ({ ok: true }) }; return { ok: true }; } });
  Object.defineProperty(g, "navigator", { configurable: true, value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }], getVideoTracks: () => [{ getSettings: () => ({ width: 960, height: 540, frameRate: camFps }) }] }) } } });
  const rnd = mulberry(3); let nW = 0;
  g.Worker = class { constructor() { this.id = nW++; log.workers.push(this); this.fail = workerFailFirst && this.id === 0; }
    postMessage(m) {
      if (m.type === "init") return setTimeout(() => this.fail ? this.onmessage({ data: { type: "error", message: "importScripts failed" } }) : this.onmessage({ data: { type: "ready", delegate: "GPU", conn: { handConn: [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]].map(([start, end]) => ({ start, end })), faceConn: [], faceMesh: [], faceOval: [] } } }), 5);
      if (m.type === "frame") { const t = performance.now() / 1000, L = hand(still ? 0.5 : 0.5 + 0.1 * Math.sin(t * 2), 0.6), h = new Float32Array(63); L.forEach((p, i) => { h[i * 3] = p.x + gauss(rnd) * .002; h[i * 3 + 1] = p.y + gauss(rnd) * .002; });
        const tR = performance.timeOrigin + performance.now(); setTimeout(() => this.onmessage({ data: { type: "result", ts: m.ts, tc: m.tc, nh: 1, hands: h, face: null, faceRan: false, faceOnly: false, last: true, tHand: aiMs, tAll: aiMs, tRecv: tR, tH0: tR, tH1: tR + aiMs, tSend: tR + aiMs } }), aiMs); } }
  };
  g.addEventListener = (n, f) => { if (n === "error") log.onerror = f; };
  const errs = []; process.on("uncaughtException", (e) => errs.push(e.message));
  await import("../public/js/main.js?" + Math.random());
  await E("startBtn").onclick(); await new Promise((r) => setTimeout(r, 80));
  if (still) { const tip = hand(0.5, 0.6)[8], b = el("btnA"); b.rect = { left: 960 - tip.x * 960 - 25, top: tip.y * 540 - 25, right: 960 - tip.x * 960 + 25, bottom: tip.y * 540 + 25, width: 50, height: 50 }; g.__btns = [b]; g.__btnA = b; }
  let pf = 0, stop = false; (function tick() { if (stop) return; pf++; if (cb) { const f = cb; cb = null; f(performance.now(), noPresented ? { expectedDisplayTime: performance.now() + 16 } : { presentedFrames: pf, expectedDisplayTime: performance.now() + 16, captureTime: performance.now() - 30 }); } setTimeout(tick, 1000 / camFps); })();
  await new Promise((r) => setTimeout(r, secs * 1000)); stop = true;
  const sk = g.__skel, set = sk.slots[0].set; const dtOk = set.last > performance.now() - 2000 && sk.fm.cap > performance.now() - 2000;   // lỗi cũ: fm.cap=0 → last≈vài ms
  return { dtOk, hover: !!g.__btnA?.classList.has("kb-hover"), clicks: g.__btnA?.clicked || 0, errors: errs, errBanner: E("error").textContent, arcs: log.arcs, draws: log.draws, fps: E("fps").textContent, hands: E("hands").textContent, model: E("modelState").textContent, gest: E("gest").textContent, aiFps: +(/ai (\d+)/.exec(E("tele").textContent)?.[1] || 0), level: /↓(\d)/.exec(E("tele").textContent)?.[1] || "0", tele: E("tele").textContent, workers: log.workers.length };
}
if (process.argv[1]?.endsWith("e2e.js")) { const r = await e2e(); console.log(JSON.stringify({ ...r, tele: undefined }, null, 1)); console.log(r.tele); process.exit(0); }
