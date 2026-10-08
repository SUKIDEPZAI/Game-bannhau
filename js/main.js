import { Engine } from "./engine.js";
import { SmoothSet } from "./smoothing.js";
import { gesture } from "./gesture.js";
import { Renderer, STYLES } from "./renderer.js";

const $ = (id) => document.getElementById(id);
const video = $("video"), canvas = $("overlay"), stage = $("stage");
const engine = new Engine(), rend = new Renderer(canvas);
const slots = [0, 1].map(() => ({ set: new SmoothSet(21, { minCutoff: 2, beta: 40, tau: 0.012 }), label: "" }));
const face = new SmoothSet(478, { minCutoff: 1.4, beta: 24, dCutoff: 5, tau: 0.02 });
let stream = null, running = false, facing = "user", frameNo = 0, lastVT = -1, lastRaf = 0;
let show = { hands: true, head: true }, frames = 0, fpsT = performance.now(), infer = 0, hudT = 0, rawHands = 0, rawFace = 0, noDet = 0, useRVFC = false;

const showError = (m, ms = 7000) => { const e = $("error"); e.textContent = m; e.classList.remove("hidden"); clearTimeout(showError.t); if (ms) showError.t = setTimeout(() => e.classList.add("hidden"), ms); };
addEventListener("error", (e) => showError("Lỗi: " + e.message));
addEventListener("unhandledrejection", (e) => showError("Lỗi: " + (e.reason?.message || e.reason)));
const setBtn = (on) => { $("startBtn").classList.toggle("hidden", on); $("stopBtn").classList.toggle("hidden", !on); };

async function ensureModel() {
  if (engine.ready) return true;
  try {
    await engine.load((s) => { $("modelState").textContent = "LOAD"; showError(s, 0); });
    $("modelState").textContent = `${engine.delegate.hand}/${engine.delegate.face}`; $("error").classList.add("hidden"); return true;
  } catch (e) { console.error(e); $("modelState").textContent = "ERR"; showError("Không tải được mô hình AI: " + (e.message || e) + ". Kiểm tra mạng / mở qua HTTPS hoặc localhost."); return false; }
}

async function startCamera() {
  try {
    stream?.getTracks().forEach((t) => t.stop());
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 60 } } });
    video.srcObject = stream; await video.play();
    rend.mirrored = facing === "user"; stage.classList.toggle("mirror", rend.mirrored);
    $("welcome").classList.add("hidden"); setBtn(true); noDet = 0;
    if (!running) {
      running = true; lastRaf = performance.now(); requestAnimationFrame(loop);
      if ("requestVideoFrameCallback" in video) { useRVFC = true; const cb = () => { if (!running) return; runAI(performance.now()); video.requestVideoFrameCallback(cb); }; video.requestVideoFrameCallback(cb); }
    }
  } catch (e) {
    console.error(e); setBtn(false);
    showError("Không mở được camera." + (isSecureContext ? " Hãy cấp quyền camera." : " Cần HTTPS hoặc localhost."));
  }
}
function stopCamera() { running = false; stream?.getTracks().forEach((t) => t.stop()); stream = null; rend.clear(); setBtn(false); $("welcome").classList.remove("hidden"); }

// Gán tay vào 2 slot cố định theo vị trí cổ tay → bộ lọc không bị hoán đổi.
function assignHands(dets, now) {
  const used = new Set(), aspect = video.videoWidth / video.videoHeight || 1;
  for (const lm of dets) {
    if (Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y) < 0.02) continue;   // tay mất dấu bị co về gốc → bỏ (kinh nghiệm từ reze-mipo)
    let best = -1, bd = Infinity;
    slots.forEach((s, i) => {
      if (used.has(i)) return;
      const live = s.set.has && s.set.miss < 8, dd = live ? Math.hypot(lm[0].x - s.set.x[0], lm[0].y - s.set.x[1]) : 0.5;
      if (dd < bd) { bd = dd; best = i; }
    });
    if (best < 0) continue;
    const s = slots[best]; used.add(best);
    if (s.set.miss >= 8) s.set.reset();
    s.set.push(lm, now); s.label = gesture(s.set, aspect);
  }
  slots.forEach((s, i) => { if (!used.has(i)) s.set.miss++; });
}

function runAI(now) {                                     // chạy ngay khi có khung camera mới
  if (document.hidden || !engine.ready || video.readyState < 2 || video.currentTime === lastVT) return;
  lastVT = video.currentTime; frameNo++;
  rend.resize(video.videoWidth, video.videoHeight);
  const t0 = performance.now();
  if (show.hands) { const d = engine.detectHands(video, now); rawHands = d.length; assignHands(d, now); }
  if (show.head && frameNo % 2 === 0) {
    const f = engine.detectFace(video, now); rawFace = f ? 1 : 0;
    if (f) { if (face.miss >= 8) face.reset(); face.push(f, now); } else face.miss++;
  }
  infer += (performance.now() - t0 - infer) * .15; frames++;
  noDet = rawHands || rawFace ? 0 : noDet + 1;
}

function loop(now) {
  if (!running) return;
  requestAnimationFrame(loop);
  const dt = Math.min(.1, (now - lastRaf) / 1000); lastRaf = now;
  if (!useRVFC) runAI(now);
  rend.clear();
  let hands = 0; const lead = infer / 1000 + 0.012;       // bù đúng độ trễ AI đo được + 1 frame hiển thị
  for (const s of slots) {
    const vis = show.hands && s.set.has && s.set.miss < 5; if (vis) hands++;
    s.set.lead = lead; s.set.step(dt, vis, now); rend.hand(s.set, engine.handConn || [], s.label, dt);
  }
  face.lead = lead; face.step(dt, show.head && face.has && face.miss < 6, now);
  if (hands === 2) rend.lasers(slots[0].set, slots[1].set);
  if (engine.ready) rend.head(face, engine);
  if (now - hudT > 250) {
    $("fps").textContent = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now; hudT = now;
    $("lat").textContent = Math.round(infer) + "ms"; $("lead").textContent = "-" + Math.round(lead * 1000) + "ms"; $("hands").textContent = hands;
    $("head").textContent = face.alpha > .5 ? "ON" : "—";
    $("gest").textContent = slots.filter((s) => s.set.alpha > .5).map((s) => s.label).join(" · ") || "—";
    if (noDet > 90) showError("AI đang chạy nhưng chưa thấy tay/đầu — đưa tay vào khung hình và đảm bảo đủ sáng.", 3000);
  }
}

function snapshot() {
  if (!running) return;
  const c = Object.assign(document.createElement("canvas"), { width: canvas.width, height: canvas.height }), g = c.getContext("2d");
  if (rend.mirrored) { g.translate(c.width, 0); g.scale(-1, 1); }
  g.drawImage(video, 0, 0, c.width, c.height); g.drawImage(canvas, 0, 0);
  c.toBlob((b) => { const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(b), download: `skeleton-${Date.now()}.png` }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); });
}
const cycleStyle = () => { rend.style = (rend.style + 1) % STYLES.length; $("style").textContent = STYLES[rend.style]; };
const toggle = (k, btn) => { show[k] = !show[k]; btn.classList.toggle("off", !show[k]); };
const full = () => document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.().catch(() => {});

$("startBtn").onclick = $("startMain").onclick = async () => { if (await ensureModel()) await startCamera(); };
$("stopBtn").onclick = stopCamera; $("snapBtn").onclick = snapshot;
$("styleBtn").onclick = cycleStyle;
$("handBtn").onclick = () => toggle("hands", $("handBtn")); $("headBtn").onclick = () => toggle("head", $("headBtn"));
$("fullBtn").onclick = $("fullMain").onclick = full;
$("switchBtn").onclick = () => { facing = facing === "user" ? "environment" : "user"; if (running) startCamera(); };
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "f") full(); else if (k === "c") $("switchBtn").click(); else if (k === "s") snapshot();
  else if (k === "v") cycleStyle(); else if (k === "h") $("handBtn").click(); else if (k === "e") $("headBtn").click();
});
