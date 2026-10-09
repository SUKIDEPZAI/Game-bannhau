// Client: latest-frame-wins (tối đa 1 khung đang xử lý, khung đến khi bận bị BỎ chứ không xếp hàng) + fallback main thread.
import { Engine } from "./engine.js";
import { RENDER_URL } from "./config.js";

const CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const GS = "https://storage.googleapis.com/mediapipe-models";
const G_HAND = `${GS}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`, G_FACE = `${GS}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`;

export async function pickSources() {
  if (RENDER_URL) try { if ((await fetch(`${RENDER_URL}/ping`, { cache: "no-store", signal: AbortSignal.timeout(3000) })).ok)
    return { root: `${RENDER_URL}/vendor`, handUrl: `${RENDER_URL}/models/hand_landmarker.task`, faceUrl: `${RENDER_URL}/models/face_landmarker.task` }; } catch { /* Render ngủ → CDN */ }
  return { root: CDN, handUrl: G_HAND, faceUrl: G_FACE };
}

export class InferenceClient {
  busy = false; ready = false; kind = "WORKER"; onResult = null; onIdle = null; cap = 0; tPost = 0;
  init(cfg) {
    return new Promise((res, rej) => {
      const w = (this.w = new Worker(new URL("./inference.worker.js", import.meta.url)));   // classic worker
      const to = setTimeout(() => rej(new Error("worker timeout")), 45000);
      w.onmessage = ({ data: m }) => {
        if (m.type === "ready") { clearTimeout(to); this.ready = true; this.delegate = m.delegate; Object.assign(this, m.conn); res(); }
        else if (m.type === "error") { clearTimeout(to); rej(new Error(m.message)); }
        else if (m.type === "result") { m.tRes = performance.timeOrigin + performance.now(); if (m.last) this.busy = false; this.onResult?.(m); if (m.last) this.onIdle?.(); }
      };
      w.onerror = (e) => { clearTimeout(to); rej(new Error(e.message || "worker lỗi")); };
      w.postMessage({ type: "init", ...cfg });
    });
  }
  // ts = thời điểm khung được trình chiếu · tc = thời điểm chụp (nếu có). Chỉ 1 khung trong worker (queue ≤ 1); khung mới nhất luôn được chụp lúc worker rảnh.
  async submit(video, ts, opts, tc = ts) {
    if (this.busy) return false;
    this.busy = true; const E = () => performance.timeOrigin + performance.now(), t0 = E();
    try { const bmp = await createImageBitmap(video), t1 = E(); this.cap = t1 - t0; this.tPost = t1; this.w.postMessage({ type: "frame", ts, tc, bmp, ...opts }, [bmp]); }
    catch { this.busy = false; return false; }
    return true;
  }
}

// Fallback khi worker không chạy được (iOS/Safari cũ, CSP…): suy luận ngay trên main thread, cùng giao diện.
export class MainThreadAI {
  busy = false; ready = false; kind = "MAIN"; onResult = null; onIdle = null; cap = 0; tPost = 0;
  async init() { this.e = new Engine(); await this.e.load(); Object.assign(this, { handConn: this.e.handConn, faceConn: this.e.faceConn, faceMesh: this.e.faceMesh, faceOval: this.e.faceOval, delegate: this.e.delegate.hand }); this.ready = true; }
  async submit(video, ts, o) {
    const t0 = performance.now(); let h = new Float32Array(0), nh = 0, f = null, tHand = 0, tFace = 0;
    if (o.hands) { const a = performance.now(), lms = this.e.detectHands(video, ts); h = new Float32Array(lms.length * 63); lms.forEach((lm, k) => lm.forEach((p, i) => { h[k * 63 + i * 3] = p.x; h[k * 63 + i * 3 + 1] = p.y; })); nh = lms.length; tHand = performance.now() - a; }
    if (o.face) { const a = performance.now(), r = this.e.detectFace(video, ts); if (r) { f = new Float32Array(478 * 3); r.forEach((p, i) => { f[i * 3] = p.x; f[i * 3 + 1] = p.y; }); } tFace = performance.now() - a; }
    this.busy = true; queueMicrotask(() => { this.busy = false; this.onResult?.({ ts, tc: ts, nh, hands: h, face: f, faceRan: !!o.face, faceOnly: false, last: true, tHand, tFace, tAll: performance.now() - t0 }); this.onIdle?.(); }); return true;
  }
}
