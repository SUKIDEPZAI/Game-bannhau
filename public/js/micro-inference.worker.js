// Experimental WebGPU model worker. It is intentionally isolated from the stable MediaPipe worker.
// Model package: @svenflow/micro-handpose@0.3.0 (MIT); weights are loaded by the library.
import { packMicroHands } from './model-adapters.js';
let detector = null;
let lastTs = 0;
const epoch = () => performance.timeOrigin + performance.now();

onmessage = async ({ data: m }) => {
  if (m.type === 'init') {
    try {
      if (!self.navigator?.gpu) throw new Error('WebGPU không được hỗ trợ trong trình duyệt/thiết bị này');
      const mod = await import('https://esm.sh/@svenflow/micro-handpose@0.3.0');
      detector = await mod.createHandpose({ maxHands: 2, scoreThreshold: 0.5, palmScoreThreshold: 0.5 });
      postMessage({ type: 'ready', model: 'MICRO_HANDPOSE_0_3_0', delegate: 'WEBGPU' });
    } catch (e) { postMessage({ type: 'error', message: String(e?.message || e) }); }
    return;
  }
  if (m.type === 'dispose') {
    try { detector?.dispose?.(); } catch {}
    detector = null; close(); return;
  }
  if (m.type !== 'frame' || !detector) return;
  const started = epoch(); let packed = new Float32Array(0), count = 0, elapsed = 0;
  try {
    const t0 = epoch();
    const results = await detector.detect(m.bmp);
    elapsed = epoch() - t0;
    const converted = packMicroHands(results, 2); packed = converted.hands; count = converted.count;
  } catch (e) {
    postMessage({ type: 'frame-error', message: String(e?.message || e), session: m.session });
  } finally {
    try { m.bmp?.close?.(); } catch {}
  }
  const sent = epoch();
  postMessage({ type: 'result', ts: m.ts, tc: m.tc, session: m.session, nh: count, hands: packed,
    face: null, faceRan: false, faceOnly: false, last: true, tHand: elapsed, tAll: elapsed,
    tRecv: started, tH0: started, tH1: started + elapsed, tSend: sent, tRes: sent, model: 'MICRO_HANDPOSE_0_3_0' }, [packed.buffer]);
};
