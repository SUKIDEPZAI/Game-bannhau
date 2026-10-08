import { InferenceClient, MainThreadAI, pickSources } from "./inference.js";
import { SmoothSet } from "./smoothing.js";
import { gesture } from "./gesture.js";
import { Renderer, STYLES } from "./renderer.js";
import { RENDER_URL } from "./config.js";

// ===== 3 profile: cấu hình duy nhất quyết định camera / face / hiệu ứng / kiểu dự đoán =====
const PROFILES = {
  ULTRA:    { cam: [640, 360, 60],  face: 0, style: 2, fx: { glow: false, trail: false, text: false, lasers: false }, predict: "video" },
  BALANCED: { cam: [960, 540, 60],  face: 4, style: 0, fx: { glow: true,  trail: false, text: true,  lasers: false }, predict: "video" },
  QUALITY:  { cam: [1280, 720, 30], face: 2, style: 0, fx: { glow: true,  trail: true,  text: true,  lasers: true  }, predict: "video" }
};
const $ = (id) => document.getElementById(id), setText = (id, t) => { const e = $(id); if (e) e.textContent = t; };
const video = $("video"), canvas = $("overlay"), stage = $("stage"), rend = new Renderer(canvas);
const slots = [0, 1].map(() => ({ set: new SmoothSet(21, { minCutoff: 2.2, beta: 60, tau: 0.006 }), label: "" }));
const face = new SmoothSet(478, { minCutoff: 1.6, beta: 30, dCutoff: 5, tau: 0.012 });
let ai = null, pname = "BALANCED", P = PROFILES[pname], stream = null, running = false, facing = "user", frameNo = 0, lastRaf = 0, camLag = 25;
const show = { hands: true, head: true };
const T = { cam: 0, infer: 0, th: 0, tf: 0, rtt: 0, filter: 0, render: 0, age: 0, camFps: 0, aiFps: 0, dispFps: 0, dropped: 0, res: "—" };
const cnt = { cam: 0, ai: 0, disp: 0 }; let cntT = performance.now(), hudT = 0, noDet = 0;
const ema = (cur, v, k = 0.2) => cur + (v - cur) * k;

const showError = (m, ms = 7000) => { const e = $("error"); e.textContent = m; e.classList.remove("hidden"); clearTimeout(showError.t); if (ms) showError.t = setTimeout(() => e.classList.add("hidden"), ms); };
addEventListener("error", (e) => showError("Lỗi: " + e.message));
addEventListener("unhandledrejection", (e) => showError("Lỗi: " + (e.reason?.message || e.reason)));
const setBtn = (on) => { $("startBtn").classList.toggle("hidden", on); $("stopBtn").classList.toggle("hidden", !on); };

async function ensureModel() {
  if (ai?.ready) return true;
  setText("modelState", "LOAD"); showError("Đang tải AI…", 0);
  try {
    const src = await pickSources(); const c = new InferenceClient();
    await c.init({ ...src, face: PROFILES[pname].face > 0 }); ai = c;
  } catch (e) {
    console.warn("Worker lỗi → chạy main thread:", e);
    try { const m = new MainThreadAI(); await m.init(); ai = m; } catch (e2) { setText("modelState", "ERR"); showError("Không tải được AI: " + (e2.message || e2)); return false; }
  }
  ai.onResult = onResult; setText("modelState", `${ai.kind}/${ai.delegate}`); $("error").classList.add("hidden"); return true;
}

async function startCamera() {
  try {
    stream?.getTracks().forEach((t) => t.stop());
    const [w, h, fps] = P.cam;
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: fps, max: fps } } });
    video.srcObject = stream; await video.play();
    const s = stream.getVideoTracks()[0].getSettings(); T.res = `${s.width}x${s.height}@${Math.round(s.frameRate || 0)}`;   // camera thật sự cấp gì (có thể khác yêu cầu)
    rend.mirrored = facing === "user"; stage.classList.toggle("mirror", rend.mirrored);
    $("welcome").classList.add("hidden"); setBtn(true); noDet = 0;
    if (!running) { running = true; lastRaf = performance.now(); requestAnimationFrame(loop); video.requestVideoFrameCallback(onFrame); }
  } catch (e) { console.error(e); setBtn(false); showError("Không mở được camera." + (isSecureContext ? " Hãy cấp quyền camera." : " Cần HTTPS hoặc localhost.")); }
}
function stopCamera() { running = false; stream?.getTracks().forEach((t) => t.stop()); stream = null; rend.clear(); setBtn(false); $("welcome").classList.remove("hidden"); }

// Mỗi khung camera mới: đo tuổi khung, nếu AI đang bận thì BỎ (latest-frame-wins), ngược lại gửi ngay khung mới nhất.
function onFrame(now, meta) {
  if (!running) return;
  video.requestVideoFrameCallback(onFrame); cnt.cam++;
  if (meta.captureTime) {                                          // ĐO THẬT: tuổi khung lúc callback; ƯỚC LƯỢNG: capture→hiển thị
    T.cam = ema(T.cam, now - meta.captureTime);
    if (meta.expectedDisplayTime) camLag = ema(camLag, meta.expectedDisplayTime - meta.captureTime);
  }
  if (!ai?.ready || document.hidden) return;
  if (ai.busy) { T.dropped++; return; }
  frameNo++; rend.resize(video.videoWidth, video.videoHeight);
  ai.submit(video, performance.now(), { hands: show.hands, face: show.head && P.face > 0 && frameNo % P.face === 0 });
}

function onResult(m) {
  cnt.ai++; const t0 = performance.now();
  T.infer = ema(T.infer, m.tAll); T.th = ema(T.th, m.tHand); if (m.tFace) T.tf = ema(T.tf, m.tFace);
  T.rtt = ema(T.rtt, t0 - m.ts);                                   // gửi → nhận (gồm AI + truyền)
  assign(m);
  if (m.face) { if (face.miss >= 8) face.reset(); face.pushPacked(m.face, 0, m.ts); } else if (m.faceRan) face.miss++;
  noDet = m.nh || m.face ? 0 : noDet + 1;
  T.filter = ema(T.filter, performance.now() - t0);
}

// Gán tay → slot bằng phép ghép tối ưu 2×2 dùng vị trí cổ tay DỰ ĐOÁN (tránh hoán đổi trái/phải khi hai tay giao nhau).
function assign(m) {
  const aspect = video.videoWidth / video.videoHeight || 1, H = m.hands, dets = [];
  for (let k = 0; k < m.nh; k++) { const o = k * 63; if (Math.hypot(H[o] - H[o + 27], H[o + 1] - H[o + 28]) >= 0.02) dets.push(o); }
  const cost = (o, s) => { const st = s.set; return st.has && st.miss < 8 ? Math.hypot(H[o] - (st.x[0] + st.v[0] * 0.05), H[o + 1] - (st.x[1] + st.v[1] * 0.05)) : 0.5; };
  let pick = [];
  if (dets.length === 1) pick = [cost(dets[0], slots[0]) <= cost(dets[0], slots[1]) ? 0 : 1];
  else if (dets.length >= 2) pick = cost(dets[0], slots[0]) + cost(dets[1], slots[1]) <= cost(dets[0], slots[1]) + cost(dets[1], slots[0]) ? [0, 1] : [1, 0];
  const used = new Set();
  dets.slice(0, 2).forEach((o, i) => { const s = slots[pick[i]]; used.add(pick[i]); if (s.set.miss >= 8) s.set.reset(); s.set.pushPacked(H, o, m.ts); s.label = gesture(s.set, aspect); });
  slots.forEach((s, i) => { if (!used.has(i)) s.set.miss++; });
}

function loop(raf) {
  if (!running) return;
  requestAnimationFrame(loop); cnt.disp++;
  const now = performance.now(), dt = Math.min(0.1, (raf - lastRaf) / 1000); lastRaf = raf;
  const r0 = now; rend.clear();
  const lead = (P.predict === "world" ? camLag / 1000 : 0) + 0.004;   // "video": bám khung hình đang hiển thị; "world": bám tay thật (dễ lệch trước video)
  let hands = 0;
  for (const s of slots) {
    const vis = show.hands && s.set.has && s.set.miss < 5; if (vis) hands++;
    s.set.lead = lead; s.set.step(dt, vis, now); rend.hand(s.set, ai?.handConn || [], s.label);
  }
  if (hands === 2) rend.lasers(slots[0].set, slots[1].set);
  if (P.face > 0 && ai?.ready) { face.lead = lead; face.step(dt, show.head && face.has && face.miss < 6, now); rend.head(face, ai); }
  T.render = ema(T.render, performance.now() - r0);
  T.age = ema(T.age, now - Math.max(slots[0].set.last, slots[1].set.last));
  if (now - hudT > 250) hud(now, hands);
}

function hud(now, hands) {
  const dtc = (now - cntT) / 1000; cntT = now; hudT = now;
  T.camFps = cnt.cam / dtc; T.aiFps = cnt.ai / dtc; T.dispFps = cnt.disp / dtc; cnt.cam = cnt.ai = cnt.disp = 0;
  const f = (v) => v.toFixed(1).padStart(5), vs = 500 / Math.max(30, T.dispFps);                 // nửa chu kỳ màn hình (ƯỚC LƯỢNG)
  const total = T.cam + T.age + T.render + vs;
  setText("fps", Math.round(T.dispFps)); setText("lat", T.infer.toFixed(1) + "ms"); setText("hands", hands);
  setText("head", face.alpha > .5 ? "ON" : "—"); setText("gest", slots.filter((s) => s.set.alpha > .5).map((s) => s.label).join(" · ") || "—");
  setText("lead", "~" + Math.round(T.age) + "ms"); setText("prof", pname);
  $("tele").textContent =
`PROFILE ${pname} · ${ai?.kind || "-"} · ${T.res}
CAM      ${f(T.cam)} ms  [đo] tuổi khung lúc callback${T.cam ? "" : " (không có captureTime)"}
AI       ${f(T.infer)} ms  [đo] hand ${T.th.toFixed(1)} / face ${T.tf.toFixed(1)}
XFER     ${f(Math.max(0, T.rtt - T.infer))} ms  [đo] truyền + chờ
FILTER   ${f(T.filter)} ms  [đo]
RENDER   ${f(T.render)} ms  [đo] CPU encode lệnh vẽ
AGE      ${f(T.age)} ms  [đo] từ lúc gửi khung → vẽ
PREDICT  ${f(T.age + 4)} ms  [ước lượng] tầm nhìn trước
EST TOTAL${f(total)} ms  [ước lượng] cam+age+render+½vsync
FPS cam ${T.camFps.toFixed(0)} · ai ${T.aiFps.toFixed(0)} · hiển thị ${T.dispFps.toFixed(0)} · DROPPED ${T.dropped}`;
  if (noDet > 90) showError("AI chạy nhưng chưa thấy tay/đầu — đưa tay vào khung và đủ sáng.", 3000);
}

async function setProfile(n) {
  pname = n; P = PROFILES[n]; Object.assign(rend.fx, P.fx); rend.style = P.style; setText("style", STYLES[rend.style]); setText("prof", n);
  if (!P.face) { face.reset(); face.miss = 99; }
  if (running) await startCamera();
}
const cycleProfile = () => setProfile(Object.keys(PROFILES)[(Object.keys(PROFILES).indexOf(pname) + 1) % 3]);
const cycleStyle = () => { rend.style = (rend.style + 1) % STYLES.length; setText("style", STYLES[rend.style]); };
const toggle = (k, btn) => { show[k] = !show[k]; btn.classList.toggle("off", !show[k]); };
const full = () => document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.().catch(() => {});
function snapshot() {
  if (!running) return;
  const c = Object.assign(document.createElement("canvas"), { width: canvas.width, height: canvas.height }), g = c.getContext("2d");
  if (rend.mirrored) { g.translate(c.width, 0); g.scale(-1, 1); }
  g.drawImage(video, 0, 0, c.width, c.height); g.drawImage(canvas, 0, 0);
  c.toBlob((b) => { const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(b), download: `skeleton-${Date.now()}.png` }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); });
}
async function pingRender() {
  if (!RENDER_URL) { setText("ping", "—"); return; }
  const t = performance.now();
  try { const r = await fetch(`${RENDER_URL}/ping?t=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(8000) }); setText("ping", r.ok ? Math.round(performance.now() - t) + "ms" : "lỗi"); } catch { setText("ping", "đang dậy…"); }
}
pingRender(); setInterval(pingRender, 60000);

$("startBtn").onclick = $("startMain").onclick = async () => { await setProfile(pname); if (await ensureModel()) await startCamera(); };
$("stopBtn").onclick = stopCamera; $("snapBtn").onclick = snapshot; $("profBtn").onclick = cycleProfile; $("styleBtn").onclick = cycleStyle;
$("handBtn").onclick = () => toggle("hands", $("handBtn")); $("headBtn").onclick = () => toggle("head", $("headBtn"));
$("fullBtn").onclick = $("fullMain").onclick = full;
$("switchBtn").onclick = () => { facing = facing === "user" ? "environment" : "user"; if (running) startCamera(); };
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "f") full(); else if (k === "c") $("switchBtn").click(); else if (k === "s") snapshot(); else if (k === "v") cycleStyle();
  else if (k === "p") cycleProfile(); else if (k === "t") $("tele").classList.toggle("hidden"); else if (k === "h") $("handBtn").click(); else if (k === "e") $("headBtn").click();
});
