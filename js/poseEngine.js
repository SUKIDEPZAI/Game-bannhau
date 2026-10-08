// Tải MediaPipe PoseLandmarker (GPU → CPU fallback). Tách riêng như poseEngine.js của FormFlow.
const VER = "1.0.1";
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}`;
const MODEL = (n) => `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${n}/float16/1/pose_landmarker_${n}.task`;

export class PoseEngine {
  constructor() { this.lm = null; this.key = null; this.lastTs = 0; this.vision = null; this.mod = null; }
  get ready() { return !!this.lm; }

  async load(key = "lite") {
    if (this.lm && this.key === key) return;
    const old = this.lm; this.lm = null; old?.close?.();
    this.mod ??= await import(`${CDN}/+esm`);
    this.vision ??= await this.mod.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
    const make = (delegate) => this.mod.PoseLandmarker.createFromOptions(this.vision, {
      baseOptions: { modelAssetPath: MODEL(key), delegate }, runningMode: "VIDEO", numPoses: 6,
      minPoseDetectionConfidence: .5, minPosePresenceConfidence: .5, minTrackingConfidence: .5
    });
    try { this.lm = await make("GPU"); this.delegate = "GPU"; }
    catch { this.lm = await make("CPU"); this.delegate = "CPU"; }
    this.key = key;
  }

  detect(video, ts) {
    this.lastTs = Math.max(ts, this.lastTs + 1);      // timestamp phải tăng nghiêm ngặt
    return this.lm.detectForVideo(video, this.lastTs).landmarks || [];
  }
}
