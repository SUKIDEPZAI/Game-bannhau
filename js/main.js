import { PoseEngine } from "./poseEngine.js";
import { Tracker } from "./tracker.js";
import { Renderer, total } from "./renderer.js";
import { analyse } from "./analyzer.js";
import { Cards } from "./ui.js";

const $ = (id) => document.getElementById(id);
const video = $("video"), canvas = $("overlay"), stage = $("stage");
const engine = new PoseEngine(), tracker = new Tracker(), rend = new Renderer(canvas), cards = new Cards($("cards"));
let stream = null, running = false, facing = "user", modelKey = "lite";
let sessionReps = 0, frames = 0, fpsT = performance.now(), inferAvg = 0, hudT = 0, lastVT = -1;

const showError = (msg) => {
  const e = $("error"); e.textContent = msg; e.classList.remove("hidden");
  clearTimeout(showError.t); showError.t = setTimeout(() => e.classList.add("hidden"), 6000);
};
const setBtn = (running_) => { $("startBtn").classList.toggle("hidden", running_); $("stopBtn").classList.toggle("hidden", !running_); };

async function ensureModel() {
  $("modelState").textContent = "LOAD";
  try { await engine.load(modelKey); $("modelState").textContent = `${modelKey.toUpperCase()}·${engine.delegate}`; return true; }
  catch (e) { console.error(e); $("modelState").textContent = "ERR"; showError("Không tải được mô hình AI. Kiểm tra mạng rồi thử lại."); return false; }
}

async function startCamera() {
  try {
    stream?.getTracks().forEach((t) => t.stop());
    stream = await navigator.mediaDevices.getUserMedia({ audio: false,
      video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 60 } } });
    video.srcObject = stream; await video.play();
    rend.mirrored = facing === "user"; stage.classList.toggle("mirror", rend.mirrored);
    $("welcome").classList.add("hidden"); setBtn(true); $("state").textContent = "Đang nhận diện";
    if (!running) { running = true; schedule(); }
  } catch (e) {
    console.error(e);
    showError("Không mở được camera." + (isSecureContext ? "" : " Trang chưa ở secure context (cần HTTPS/localhost)."));
    $("state").textContent = "Lỗi camera"; setBtn(false);
  }
}
function stopCamera() {
  running = false; stream?.getTracks().forEach((t) => t.stop()); stream = null;
  rend.clear(); cards.update([], 0); setBtn(false);
  $("state").textContent = "Đã dừng"; $("welcome").classList.remove("hidden");
}

// requestVideoFrameCallback: chạy đúng mỗi khi có khung hình camera mới (không poll như rAF).
const schedule = () => video.requestVideoFrameCallback ? video.requestVideoFrameCallback(frame) : requestAnimationFrame(frame);

function frame() {
  if (!running) return;
  schedule();
  if (document.hidden || !engine.ready || video.currentTime === lastVT || video.readyState < 2) return;
  lastVT = video.currentTime;
  const now = performance.now();
  rend.resize(video.videoWidth, video.videoHeight);
  const t0 = performance.now();
  const dets = engine.detect(video, now);
  inferAvg += (performance.now() - t0 - inferAvg) * 0.15;
  const list = tracker.update(dets, now);
  rend.clear();
  for (const t of list) { analyse(t, now, () => sessionReps++); rend.draw(t, now); }
  frames++;
  if (now - hudT > 250) {                         // HUD chỉ cập nhật 4 lần/giây
    hudT = now;
    const fps = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now;
    cards.update(list, now);
    $("fps").textContent = fps; $("lat").textContent = Math.round(inferAvg) + "ms";
    $("people").textContent = list.length; $("reps").textContent = sessionReps;
    $("state").textContent = list.length ? "Đang nhận diện" : "Tìm người…";
  }
}

function snapshot() {
  if (!running) return;
  const c = Object.assign(document.createElement("canvas"), { width: canvas.width, height: canvas.height }), g = c.getContext("2d");
  if (rend.mirrored) { g.translate(c.width, 0); g.scale(-1, 1); }
  g.drawImage(video, 0, 0, c.width, c.height); g.drawImage(canvas, 0, 0);
  c.toBlob((b) => { const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(b), download: `pose-${Date.now()}.png` }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); });
}
const resetReps = () => { sessionReps = 0; tracker.resetReps(); $("reps").textContent = 0; };
const toggleFull = () => document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.().catch(() => {});
async function switchModel() {
  modelKey = modelKey === "lite" ? "full" : "lite"; $("modelBtn").textContent = modelKey.toUpperCase();
  if (engine.ready) await ensureModel();
}

$("startBtn").onclick = $("startMain").onclick = async () => { if (await ensureModel()) await startCamera(); };
$("stopBtn").onclick = stopCamera; $("snapBtn").onclick = snapshot; $("resetBtn").onclick = resetReps;
$("modelBtn").onclick = switchModel; $("fullBtn").onclick = $("fullMain").onclick = toggleFull;
$("switchBtn").onclick = () => { facing = facing === "user" ? "environment" : "user"; if (running) startCamera(); };
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "f") toggleFull(); else if (k === "c") $("switchBtn").click(); else if (k === "s") snapshot();
  else if (k === "r") resetReps(); else if (k === "m") switchModel();
});
