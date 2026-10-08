import { Engine } from "./engine.js";
import { SmoothSet } from "./smoothing.js";
import { gesture } from "./gesture.js";
import { Renderer } from "./renderer.js";

const $ = (id) => document.getElementById(id);
const video = $("video"), canvas = $("overlay"), stage = $("stage");
const engine = new Engine(), rend = new Renderer(canvas);
const slots = [0, 1].map(() => ({ set: new SmoothSet(21), label: "", color: "" }));
const face = new SmoothSet(478, { minCutoff: 1.1, beta: 10, tau: 0.035 });
let stream = null, running = false, facing = "user", frameNo = 0, lastVT = -1, lastRaf = performance.now();
let show = { hands: true, head: true }, fps = 0, frames = 0, fpsT = performance.now(), infer = 0, hudT = 0;

const showError = (m) => { const e = $("error"); e.textContent = m; e.classList.remove("hidden"); clearTimeout(showError.t); showError.t = setTimeout(() => e.classList.add("hidden"), 6000); };
const setBtn = (on) => { $("startBtn").classList.toggle("hidden", on); $("stopBtn").classList.toggle("hidden", !on); };

async function ensureModel() {
  if (engine.ready) return true;
  $("modelState").textContent = "LOAD";
  try { await engine.load(); $("modelState").textContent = engine.delegate; return true; }
  catch (e) { console.error(e); $("modelState").textContent = "ERR"; showError("Không tải được mô hình AI. Kiểm tra mạng rồi thử lại."); return false; }
}

async function startCamera() {
  try {
    stream?.getTracks().forEach((t) => t.stop());
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 60 } } });
    video.srcObject = stream; await video.play();
    rend.mirrored = facing === "user"; stage.classList.toggle("mirror", rend.mirrored);
    $("welcome").classList.add("hidden"); setBtn(true);
    if (!running) { running = true; lastRaf = performance.now(); requestAnimationFrame(loop); }
  } catch (e) {
    console.error(e); setBtn(false);
    showError("Không mở được camera." + (isSecureContext ? "" : " Cần HTTPS hoặc localhost."));
  }
}
function stopCamera() {
  running = false; stream?.getTracks().forEach((t) => t.stop()); stream = null;
  rend.clear(); setBtn(false); $("welcome").classList.remove("hidden");
}

// Gán bàn tay phát hiện được vào 2 slot cố định (gần nhất theo cổ tay) → bộ lọc không bị đổi chỗ.
function assignHands(dets, now) {
  const used = new Set();
  for (const lm of dets) {
    let best = -1, bd = Infinity;
    slots.forEach((s, i) => {
      if (used.has(i)) return;
      const dd = s.set.has && s.set.miss < 8 ? Math.hypot(lm[0].x - s.set.x[0], lm[0].y - s.set.x[1]) : 0.5;
      if (dd < bd) { bd = dd; best = i; }
    });
    if (best < 0) continue;
    const s = slots[best]; used.add(best);
    if (s.set.miss >= 8) s.set.reset();
    s.set.push(lm, now);
    s.label = gesture(s.set, video.videoWidth / video.videoHeight);
  }
  slots.forEach((s, i) => { if (!used.has(i)) s.set.miss++; });
}

function loop(now) {
  if (!running) return;
  requestAnimationFrame(loop);
  const dt = Math.min(.1, (now - lastRaf) / 1000); lastRaf = now;
  if (!document.hidden && engine.ready && video.readyState >= 2) {
    rend.resize(video.videoWidth, video.videoHeight);
    if (video.currentTime !== lastVT) {                       // chỉ chạy AI khi có khung camera mới
      lastVT = video.currentTime; frameNo++;
      const t0 = performance.now();
      if (show.hands) assignHands(engine.detectHands(video, now), now);
      if (show.head && frameNo % 2 === 0) {                  // đầu di chuyển chậm hơn tay → chạy xen kẽ, nội suy bù
        const f = engine.detectFace(video, now);
        if (f) { if (face.miss >= 8) face.reset(); face.push(f, now); } else face.miss++;
      }
      infer += (performance.now() - t0 - infer) * .15; frames++;
    }
  }
  rend.clear();
  const aspect = video.videoWidth / video.videoHeight || 1;
  let hands = 0;
  for (const s of slots) {
    const vis = show.hands && s.set.has && s.set.miss < 5; if (vis) hands++;
    s.set.step(dt, vis); rend.hand(s.set, engine.handConn || [], s.label);
  }
  face.step(dt, show.head && face.has && face.miss < 6); if (engine.ready) rend.head(face, engine.faceConn);
  if (now - hudT > 250) {
    fps = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now; hudT = now;
    $("fps").textContent = fps; $("lat").textContent = Math.round(infer) + "ms"; $("hands").textContent = hands;
    $("head").textContent = face.alpha > .5 ? "ON" : "—";
    $("gest").textContent = slots.filter((s) => s.set.alpha > .5).map((s) => s.label).join(" · ") || "—";
  }
}

function snapshot() {
  if (!running) return;
  const c = Object.assign(document.createElement("canvas"), { width: canvas.width, height: canvas.height }), g = c.getContext("2d");
  if (rend.mirrored) { g.translate(c.width, 0); g.scale(-1, 1); }
  g.drawImage(video, 0, 0, c.width, c.height); g.drawImage(canvas, 0, 0);
  c.toBlob((b) => { const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(b), download: `skeleton-${Date.now()}.png` }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); });
}
const toggle = (k, btn) => { show[k] = !show[k]; btn.classList.toggle("off", !show[k]); };
const full = () => document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.().catch(() => {});

$("startBtn").onclick = $("startMain").onclick = async () => { if (await ensureModel()) await startCamera(); };
$("stopBtn").onclick = stopCamera; $("snapBtn").onclick = snapshot;
$("handBtn").onclick = () => toggle("hands", $("handBtn")); $("headBtn").onclick = () => toggle("head", $("headBtn"));
$("fullBtn").onclick = $("fullMain").onclick = full;
$("switchBtn").onclick = () => { facing = facing === "user" ? "environment" : "user"; if (running) startCamera(); };
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "f") full(); else if (k === "c") $("switchBtn").click(); else if (k === "s") snapshot();
  else if (k === "h") $("handBtn").click(); else if (k === "e") $("headBtn").click();
});
