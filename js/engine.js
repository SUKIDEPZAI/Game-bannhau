// HandLandmarker (21 điểm/tay) + FaceLandmarker (478 điểm). Tải tuần tự, mỗi model tự fallback GPU → CPU,
// và thử nhiều phiên bản CDN để không "im lặng" khi một bản bị lỗi.
const VERSIONS = ["0.10.14", "0.10.21", "latest"];
const GS = "https://storage.googleapis.com/mediapipe-models";
const HAND = `${GS}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`;
const FACE = `${GS}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`;
const base = (v) => `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision${v === "latest" ? "" : "@" + v}`;

export class Engine {
  ready = false; delegate = {}; errors = 0; ts = { hand: 0, face: 0 };

  async load(status = () => {}) {
    let mod, root, lastErr;
    for (const v of VERSIONS) {
      try { status(`Tải thư viện ${v}…`); root = base(v); mod = await import(`${root}/+esm`); break; }
      catch (e) { lastErr = e; console.warn("CDN lỗi", v, e); }
    }
    if (!mod) throw lastErr;
    const vision = await mod.FilesetResolver.forVisionTasks(`${root}/wasm`);
    const build = async (name, Cls, opts, url) => {
      for (const delegate of ["GPU", "CPU"]) {
        try { status(`Tải model ${name} (${delegate})…`); const m = await Cls.createFromOptions(vision, { baseOptions: { modelAssetPath: url, delegate }, runningMode: "VIDEO", ...opts }); this.delegate[name] = delegate; return m; }
        catch (e) { console.warn(name, delegate, e); if (delegate === "CPU") throw e; }
      }
    };
    this.hands = await build("hand", mod.HandLandmarker, { numHands: 2, minHandDetectionConfidence: .4, minHandPresenceConfidence: .4, minTrackingConfidence: .4 }, HAND);
    this.face = await build("face", mod.FaceLandmarker, { numFaces: 1, minFaceDetectionConfidence: .4, minFacePresenceConfidence: .4, minTrackingConfidence: .4 }, FACE);
    this.handConn = mod.HandLandmarker.HAND_CONNECTIONS;
    this.faceConn = mod.FaceLandmarker.FACE_LANDMARKS_CONTOURS;
    this.ready = true;
  }
  detectHands(v, t) { try { this.ts.hand = Math.max(t, this.ts.hand + 1); return this.hands.detectForVideo(v, this.ts.hand).landmarks || []; } catch (e) { this.fail(e); return []; } }
  detectFace(v, t) { try { this.ts.face = Math.max(t, this.ts.face + 1); return this.face.detectForVideo(v, this.ts.face).faceLandmarks?.[0] || null; } catch (e) { this.fail(e); return null; } }
  fail(e) { if (this.errors++ < 3) console.error("detect lỗi", e); }
}
