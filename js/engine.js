// MediaPipe HandLandmarker (21 điểm/bàn tay) + FaceLandmarker (478 điểm đầu/mặt). GPU → CPU fallback.
const CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const GS = "https://storage.googleapis.com/mediapipe-models";
const HAND = `${GS}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`;
const FACE = `${GS}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`;

export class Engine {
  ready = false; ts = { hand: 0, face: 0 };
  async load() {
    const mod = await import(`${CDN}/+esm`);
    const vision = await mod.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
    const make = (delegate) => Promise.all([
      mod.HandLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: HAND, delegate }, runningMode: "VIDEO", numHands: 2,
        minHandDetectionConfidence: .5, minHandPresenceConfidence: .5, minTrackingConfidence: .5 }),
      mod.FaceLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: FACE, delegate }, runningMode: "VIDEO", numFaces: 1,
        minFaceDetectionConfidence: .5, minFacePresenceConfidence: .5, minTrackingConfidence: .5 })
    ]);
    try { [this.hands, this.face] = await make("GPU"); this.delegate = "GPU"; }
    catch { [this.hands, this.face] = await make("CPU"); this.delegate = "CPU"; }
    this.handConn = mod.HandLandmarker.HAND_CONNECTIONS;
    this.faceConn = mod.FaceLandmarker.FACE_LANDMARKS_CONTOURS;
    this.ready = true;
  }
  detectHands(v, t) { this.ts.hand = Math.max(t, this.ts.hand + 1); return this.hands.detectForVideo(v, this.ts.hand).landmarks || []; }
  detectFace(v, t) { this.ts.face = Math.max(t, this.ts.face + 1); return this.face.detectForVideo(v, this.ts.face).faceLandmarks?.[0] || null; }
}
