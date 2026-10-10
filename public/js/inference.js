// Client: latest-frame-wins (tối đa 1 khung đang xử lý, khung đến khi bận bị BỎ chứ không xếp hàng) + fallback main thread.
import { Engine } from "./engine.js";
import { RENDER_URL, INFERENCE_FRAME } from "./config.js";

const CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const GS = "https://storage.googleapis.com/mediapipe-models";
const G_HAND = `${GS}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`, G_FACE = `${GS}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`;

// Render chỉ được dùng khi /ping trả JSON ok VÀ /vendor/vision_bundle.cjs tồn tại (tránh trường hợp URL trỏ vào app khác / Render thiếu file).
async function renderOk() {
  if (!RENDER_URL) return false;
  try {
    const sig = AbortSignal.timeout(3000);
    const [p, v] = await Promise.all([fetch(`${RENDER_URL}/ping`, { cache: "no-store", signal: sig }), fetch(`${RENDER_URL}/vendor/vision_bundle.cjs`, { method: "HEAD", signal: sig })]);
    return p.ok && v.ok && !!(await p.json().catch(() => null))?.ok;
  } catch { return false; }                                       // Render ngủ / lỗi → CDN
}
// Trả về DANH SÁCH nguồn theo thứ tự thử: [Render?, CDN]. Worker lỗi ở nguồn này → thử nguồn kế (trước khi rơi xuống main thread).
export async function pickSources() {
  const out = [];
  if (await renderOk()) out.push({ root: `${RENDER_URL}/vendor`, handUrl: `${RENDER_URL}/models/hand_landmarker.task`, faceUrl: `${RENDER_URL}/models/face_landmarker.task` });
  out.push({ root: CDN, handUrl: G_HAND, faceUrl: G_FACE });
  return out;
}

export class InferenceClient {
  busy = false; ready = false; kind = "WORKER"; onResult = null; onIdle = null; onFailure = null;
  cap = 0; tPost = 0; initTimer = 0; frameTimer = 0; frameId = 0;
  init(cfg) {
    return new Promise((res, rej) => {
      const w = (this.w = new Worker(new URL("./inference.worker.js", import.meta.url)));
      let settled = false;
      const initError = (error) => {
        clearTimeout(this.initTimer); this.initTimer = 0;
        if (!this.ready) {
          if (!settled) { settled = true; rej(error); }
          return;
        }
        this.ready = false; this.busy = false;
        clearTimeout(this.frameTimer); this.frameTimer = 0;
        w.terminate?.(); this.onFailure?.(error);
      };
      this.initTimer = setTimeout(() => initError(new Error("worker timeout")), 30000);
      w.onmessage = ({ data: m }) => {
        if (m.type === "ready") {
          clearTimeout(this.initTimer); this.initTimer = 0;
          this.ready = true; this.delegate = m.delegate; Object.assign(this, m.conn);
          if (!settled) { settled = true; res(); }
        } else if (m.type === "error") initError(new Error(m.message));
        else if (m.type === "result") {
          m.tRes = performance.timeOrigin + performance.now();
          if (m.last) { clearTimeout(this.frameTimer); this.frameTimer = 0; this.busy = false; }
          this.onResult?.(m);
          if (m.last) this.onIdle?.();
        }
      };
      w.onerror = (e) => initError(new Error(e.message || "worker lỗi"));
      w.postMessage({ type: "init", ...cfg });
    });
  }
  // Chỉ một frame đang chạy; timeout bảo vệ khỏi Worker treo hoặc createImageBitmap không trả về.
  async submit(video, ts, opts, tc = ts, session = 0) {
    if (this.busy || !this.ready) return false;
    this.busy = true; const id = ++this.frameId, E = () => performance.timeOrigin + performance.now(), t0 = E();
    clearTimeout(this.frameTimer);
    this.frameTimer = setTimeout(() => {
      if (id !== this.frameId || !this.busy) return;
      const error = new Error("worker frame timeout (5000 ms)");
      this.ready = false; this.busy = false; this.frameTimer = 0;
      this.w?.terminate?.(); this.onFailure?.(error);
    }, 5000);
    try {
      // Downscale only the inference input. The visible video/canvas keeps its native resolution;
      // landmarks are normalized, so coordinates remain aligned when aspect ratio is preserved.
      let bmp;
      try { bmp = await createImageBitmap(video, { resizeWidth: INFERENCE_FRAME.width, resizeHeight: INFERENCE_FRAME.height, resizeQuality: INFERENCE_FRAME.resizeQuality }); }
      catch { bmp = await createImageBitmap(video); } // compatibility fallback for older browsers
      const t1 = E();
      if (id !== this.frameId || !this.busy || !this.ready) { bmp.close?.(); return false; }
      this.cap = t1 - t0; this.tPost = t1;
      this.w.postMessage({ type: "frame", ts, tc, session, bmp, ...opts }, [bmp]);
    } catch {
      if (id === this.frameId) { clearTimeout(this.frameTimer); this.frameTimer = 0; this.busy = false; }
      return false;
    }
    return true;
  }
}

// Fallback khi worker không chạy được (iOS/Safari cũ, CSP…): suy luận ngay trên main thread, cùng giao diện.
export class MainThreadAI {
  busy = false; ready = false; kind = "MAIN"; onResult = null; onIdle = null; cap = 0; tPost = 0;
  async init() { this.e = new Engine(); await this.e.load(); Object.assign(this, { handConn: this.e.handConn, faceConn: this.e.faceConn, faceMesh: this.e.faceMesh, faceOval: this.e.faceOval, delegate: this.e.delegate.hand }); this.ready = true; }
  async submit(video, ts, o, tc = ts, session = 0) {
    const t0 = performance.now(); let h = new Float32Array(0), nh = 0, f = null, tHand = 0, tFace = 0;
    if (o.hands) { const a = performance.now(), lms = this.e.detectHands(video, ts); h = new Float32Array(lms.length * 63); lms.forEach((lm, k) => lm.forEach((p, i) => { h[k * 63 + i * 3] = p.x; h[k * 63 + i * 3 + 1] = p.y; })); nh = lms.length; tHand = performance.now() - a; }
    if (o.face) { const a = performance.now(), r = this.e.detectFace(video, ts); if (r) { f = new Float32Array(478 * 3); r.forEach((p, i) => { f[i * 3] = p.x; f[i * 3 + 1] = p.y; }); } tFace = performance.now() - a; }
    this.busy = true; queueMicrotask(() => { this.busy = false; this.onResult?.({ ts, tc, session, nh, hands: h, face: f, faceRan: !!o.face, faceOnly: false, last: true, tHand, tFace, tAll: performance.now() - t0 }); this.onIdle?.(); }); return true;
  }
}

// Experimental WebGPU model. If browser/device/CDN/weights fail, caller keeps or restores MediaPipe.
export class MicroHandposeClient {
  busy = false; ready = false; kind = 'MICRO'; modelId = 'micro'; delegate = 'WEBGPU'; onResult = null; onIdle = null; onFailure = null;
  frameTimer = 0; initTimer = 0; frameId = 0; cap = 0; tPost = 0;
  init() {
    if (!globalThis.navigator?.gpu) return Promise.reject(new Error('WebGPU không khả dụng trên trình duyệt/thiết bị này'));
    return new Promise((resolve, reject) => {
      const w = this.w = new Worker(new URL('./micro-inference.worker.js', import.meta.url), { type: 'module', name: 'skeleton-micro-webgpu' });
      let settled = false;
      const fail = error => {
        clearTimeout(this.initTimer); clearTimeout(this.frameTimer);
        if (!this.ready) { if (!settled) { settled = true; reject(error); } w.terminate(); return; }
        this.ready = false; this.busy = false; w.terminate(); this.onFailure?.(error);
      };
      this.initTimer = setTimeout(() => fail(new Error('WebGPU model init timeout')), 35000);
      w.onmessage = ({ data: m }) => {
        if (m.type === 'ready') {
          clearTimeout(this.initTimer); this.initTimer = 0; this.ready = true; this.delegate = m.delegate || 'WEBGPU';
          if (!settled) { settled = true; resolve(); }
        } else if (m.type === 'error') fail(new Error(m.message || 'WebGPU model init failed'));
        else if (m.type === 'frame-error') fail(new Error(m.message || 'WebGPU frame failed'));
        else if (m.type === 'result') {
          m.tRes = performance.timeOrigin + performance.now();
          clearTimeout(this.frameTimer); this.frameTimer = 0; this.busy = false;
          this.onResult?.(m); this.onIdle?.();
        }
      };
      w.onerror = e => fail(new Error(e.message || 'WebGPU worker error'));
      w.postMessage({ type: 'init' });
    });
  }
  async submit(video, ts, _opts, tc = ts, session = 0) {
    if (this.busy || !this.ready) return false;
    this.busy = true; const id = ++this.frameId; const E = () => performance.timeOrigin + performance.now(); const t0 = E();
    clearTimeout(this.frameTimer);
    this.frameTimer = setTimeout(() => { if (id !== this.frameId || !this.busy) return; this.ready = false; this.busy = false; this.w?.terminate?.(); this.onFailure?.(new Error('WebGPU frame timeout')); }, 5000);
    try {
      let bmp;
      try { bmp = await createImageBitmap(video, { resizeWidth: INFERENCE_FRAME.width, resizeHeight: INFERENCE_FRAME.height, resizeQuality: INFERENCE_FRAME.resizeQuality }); }
      catch { bmp = await createImageBitmap(video); }
      if (id !== this.frameId || !this.busy || !this.ready) { bmp.close?.(); return false; }
      this.cap = E() - t0; this.tPost = E();
      this.w.postMessage({ type: 'frame', ts, tc, session, bmp }, [bmp]); return true;
    } catch (e) {
      clearTimeout(this.frameTimer); this.frameTimer = 0; this.busy = false;
      return false;
    }
  }
  terminate() { clearTimeout(this.initTimer); clearTimeout(this.frameTimer); this.ready = false; this.busy = false; this.w?.terminate?.(); }
}
