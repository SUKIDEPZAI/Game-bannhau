// CLASSIC worker (không phải module worker): MediaPipe Tasks Vision dùng importScripts nên module worker bị lỗi
// (google-ai-edge/mediapipe#5257). Nhận ImageBitmap (transferable), trả Float32Array (transferable).
self.exports = {}; self.module = { exports: self.exports };
let hands = null, face = null, M = null, vision = null, cfg = null;
const ts = { h: 0, f: 0 };
const mk = async (Cls, url, o) => {
  for (const delegate of ["GPU", "CPU"]) {
    try { return [await Cls.createFromOptions(vision, { baseOptions: { modelAssetPath: url, delegate }, runningMode: "VIDEO", ...o }), delegate]; } catch (e) { /* thử delegate kế */ }
  }
  throw new Error("Không tạo được model " + url);
};
const makeFace = async () => { if (!face && cfg.faceUrl) [face] = await mk(M.FaceLandmarker, cfg.faceUrl, { numFaces: 1, minFaceDetectionConfidence: .4, minFacePresenceConfidence: .4, minTrackingConfidence: .4 }); };
const packHands = (lms) => { const f = new Float32Array(lms.length * 63); lms.forEach((lm, k) => lm.forEach((p, i) => { f[k * 63 + i * 3] = p.x; f[k * 63 + i * 3 + 1] = p.y; f[k * 63 + i * 3 + 2] = p.z || 0; })); return f; };

onmessage = async (e) => {
  const m = e.data;
  if (m.type === "init") {
    try {
      cfg = m; importScripts(`${m.root}/vision_bundle.cjs`);
      M = Object.assign({}, self.exports, self.module.exports);
      vision = await M.FilesetResolver.forVisionTasks(`${m.root}/wasm`);
      let delegate; [hands, delegate] = await mk(M.HandLandmarker, m.handUrl, { numHands: 2, minHandDetectionConfidence: .4, minHandPresenceConfidence: .4, minTrackingConfidence: .4 });
      if (m.face) await makeFace();
      postMessage({ type: "ready", delegate, conn: { handConn: M.HandLandmarker.HAND_CONNECTIONS, faceConn: M.FaceLandmarker.FACE_LANDMARKS_CONTOURS, faceMesh: M.FaceLandmarker.FACE_LANDMARKS_TESSELATION, faceOval: M.FaceLandmarker.FACE_LANDMARKS_FACE_OVAL } });
    } catch (err) { postMessage({ type: "error", message: String(err.message || err) }); }
    return;
  }
  if (m.type !== "frame") return;
  const t0 = performance.now(); let h = new Float32Array(0), nh = 0, f = null, tHand = 0, tFace = 0;
  try {
    if (m.hands) { const a = performance.now(); const lms = hands.detectForVideo(m.bmp, ts.h = Math.max(m.ts, ts.h + 1)).landmarks || []; h = packHands(lms); nh = lms.length; tHand = performance.now() - a; }
    if (m.face) {
      await makeFace(); const a = performance.now(); const r = face?.detectForVideo(m.bmp, ts.f = Math.max(m.ts, ts.f + 1)).faceLandmarks?.[0];
      if (r) { f = new Float32Array(478 * 3); r.forEach((p, i) => { f[i * 3] = p.x; f[i * 3 + 1] = p.y; f[i * 3 + 2] = p.z || 0; }); } tFace = performance.now() - a;
    }
  } catch (err) { /* bỏ khung lỗi, không chặn pipeline */ } finally { m.bmp.close(); }
  postMessage({ type: "result", ts: m.ts, nh, hands: h, face: f, faceRan: !!m.face, tHand, tFace, tAll: performance.now() - t0 }, f ? [h.buffer, f.buffer] : [h.buffer]);
};
