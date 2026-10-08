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
  busy = false; ready = false; kind = "WORKER"; onResult = null;
  init(cfg) {
    return new Promise((res, rej) => {
      const w = (this.w = new Worker(new URL("./inference.worker.js", import.meta.url)));   // classic worker
      const to = setTimeout(() => rej(new Error("worker timeout")), 45000);
      w.onmessage = ({ data: m }) => {
        if (m.type === "ready") { clearTimeout(to); this.ready = true; this.delegate = m.delegate; Object.assign(this, m.conn); res(); }
        else if (m.type === "error") { clearTimeout(to); rej(new Error(m.message)); }
        else if (m.type === "result") { this.busy = false; this.onResult?.(m); }
      };
      w.onerror = (e) => { clearTimeout(to); rej(new Error(e.message || "worker lỗi")); };
      w.postMessage({ type: "init", ...cfg });
    });
  }
  async submit(video, ts, opts) {
    if (this.busy) return false;
    this.busy = true;
    try { const bmp = await createImageBitmap(video); this.w.postMessage({ type: "frame", ts, bmp, ...opts }, [bmp]); }
    catch { this.busy = false; return false; }
    return true;
  }
}

// Fallback khi worker không chạy được (iOS/Safari cũ, CSP…): suy luận ngay trên main thread, cùng giao diện.
export class MainThreadAI {
  busy = false; ready = false; kind = "MAIN"; onResult = null;
  async init() { this.e = new Engine(); await this.e.load(); Object.assign(this, { handConn: this.e.handConn, faceConn: this.e.faceConn, faceMesh: this.e.faceMesh, faceOval: this.e.faceOval, delegate: this.e.delegate.hand }); this.ready = true; }
  async submit(video, ts, o) {
    const t0 = performance.now(); let h = new Float32Array(0), nh = 0, f = null, tHand = 0, tFace = 0;
    if (o.hands) { const a = performance.now(), lms = this.e.detectHands(video, ts); h = new Float32Array(lms.length * 63); lms.forEach((lm, k) => lm.forEach((p, i) => { h[k * 63 + i * 3] = p.x; h[k * 63 + i * 3 + 1] = p.y; })); nh = lms.length; tHand = performance.now() - a; }
    if (o.face) { const a = performance.now(), r = this.e.detectFace(video, ts); if (r) { f = new Float32Array(478 * 3); r.forEach((p, i) => { f[i * 3] = p.x; f[i * 3 + 1] = p.y; }); } tFace = performance.now() - a; }
    queueMicrotask(() => this.onResult?.({ ts, nh, hands: h, face: f, faceRan: !!o.face, tHand, tFace, tAll: performance.now() - t0 })); return true;
  }
}
