// Ưu tiên tài nguyên cùng domain (Render: /vendor + /models, có cache + nén) → nhanh, không phụ thuộc CDN.
// Nếu chạy trên GitHub Pages (không có /vendor) thì tự rơi về CDN jsDelivr + Google Storage.
const CDN = (v) => `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision${v === "latest" ? "" : "@" + v}`;
const SOURCES = [{ root: "/vendor", js: "/vendor/vision_bundle.mjs", local: true },
  ...["0.10.14", "0.10.21", "latest"].map((v) => ({ root: CDN(v), js: `${CDN(v)}/+esm` }))];
const GS = "https://storage.googleapis.com/mediapipe-models";
const MODEL = {
  hand: ["/models/hand_landmarker.task", `${GS}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`],
  face: ["/models/face_landmarker.task", `${GS}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`]
};

export class Engine {
  ready = false; delegate = {}; errors = 0; ts = { hand: 0, face: 0 };

  async load(status = () => {}) {
    let mod, src, lastErr;
    for (const s of SOURCES) {
      try { status(`Tải thư viện (${s.local ? "server" : "CDN"})…`); mod = await import(/* @vite-ignore */ s.js); src = s; break; }
      catch (e) { lastErr = e; console.warn("Nguồn lỗi", s.js, e); }
    }
    if (!mod) throw lastErr;
    const vision = await mod.FilesetResolver.forVisionTasks(`${src.root}/wasm`);
    const build = async (name, Cls, opts) => {
      const urls = src.local ? MODEL[name] : [MODEL[name][1]];
      for (const url of urls) for (const delegate of ["GPU", "CPU"]) {
        try { status(`Tải model ${name} (${delegate})…`); const m = await Cls.createFromOptions(vision, { baseOptions: { modelAssetPath: url, delegate }, runningMode: "VIDEO", ...opts }); this.delegate[name] = delegate; return m; }
        catch (e) { console.warn(name, url, delegate, e); }
      }
      throw new Error(`Không tạo được model ${name}`);
    };
    this.hands = await build("hand", mod.HandLandmarker, { numHands: 2, minHandDetectionConfidence: .4, minHandPresenceConfidence: .4, minTrackingConfidence: .4 });
    this.face = await build("face", mod.FaceLandmarker, { numFaces: 1, minFaceDetectionConfidence: .4, minFacePresenceConfidence: .4, minTrackingConfidence: .4 });
    this.handConn = mod.HandLandmarker.HAND_CONNECTIONS;
    this.faceConn = mod.FaceLandmarker.FACE_LANDMARKS_CONTOURS;
    this.faceMesh = mod.FaceLandmarker.FACE_LANDMARKS_TESSELATION;
    this.faceOval = mod.FaceLandmarker.FACE_LANDMARKS_FACE_OVAL;
    this.ready = true;
  }
  detectHands(v, t) { try { this.ts.hand = Math.max(t, this.ts.hand + 1); return this.hands.detectForVideo(v, this.ts.hand).landmarks || []; } catch (e) { this.fail(e); return []; } }
  detectFace(v, t) { try { this.ts.face = Math.max(t, this.ts.face + 1); return this.face.detectForVideo(v, this.ts.face).faceLandmarks?.[0] || null; } catch (e) { this.fail(e); return null; } }
  fail(e) { if (this.errors++ < 3) console.error("detect lỗi", e); }
}
