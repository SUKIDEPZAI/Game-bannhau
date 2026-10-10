import { InferenceClient, MainThreadAI, pickSources } from "./inference.js";
import { SmoothSet } from "./smoothing.js";
import { GestureTracker, SwipeDetector } from "./gesture.js";
import { Renderer, STYLES } from "./renderer.js";
import { RENDER_URL, PROFILES, DEFAULT_PROFILE, FILTER, TRACK, SCHED, PERF, INTERACT } from "./config.js";
import { Interact } from "./interact.js";
import { Metric, fmtP, Recorder } from "./telemetry.js";
import { PerfController } from "./perf.js";
import { pickAssignment } from "./tracking.js";
import { AIAgentSuite } from "./ai-agents.js";

const $ = (id) => document.getElementById(id), setText = (id, t) => { const e = $(id); if (e) e.textContent = t; };
const video = $("video"), canvas = $("overlay"), stage = $("stage"), rend = new Renderer(canvas);
const common = { maxH: FILTER.maxHorizon, gapMs: FILTER.gapMs, reacqMs: FILTER.reacqRampMs, soft: FILTER.outlierSoft, hard: FILTER.outlierHard };
const slots = [0, 1].map(() => ({ set: new SmoothSet(21, { ...FILTER.hand, ...common }), label: "", g: new GestureTracker(), sw: new SwipeDetector(), swipe: "", swipeT: -1e9 }));
const M = Object.fromEntries(["ai", "age", "render", "xfer", "cap", "xout", "wq", "back", "gest"].map((k) => [k, new Metric()]));
const rec = new Recorder(), perf = new PerfController(PERF), agents = new AIAgentSuite(); let perfT = 0, lastSubmitPf = -1, fm = { now: 0, cap: 0, pf: 0, n: 0 };
let ai = null, modelPromise = null, startPromise = null, aiRecovery = false, pname = DEFAULT_PROFILE, P = PROFILES[pname], stream = null, running = false, facing = "user", lastRaf = 0, camLag = 25;
let cameraGeneration = 0, cameraNeedsRetry = false, rafId = 0, frameCbId = null, frameCbKind = "", fallbackFrameNo = 0, lastFallbackVideoTime = -1;
const show = { hands: true };
const ix = new Interact(canvas, INTERACT, () => document.querySelectorAll(INTERACT.selector));
globalThis.__skel = { slots, fm, ix };
Object.defineProperty(globalThis.__skel, "running", { get: () => running }); // phục vụ test/E2E & gỡ lỗi trong Console
const T = { stale: 0, cam: 0, infer: 0, th: 0, rtt: 0, filter: 0, render: 0, age: 0, camFps: 0, aiFps: 0, dispFps: 0, dropped: 0, res: "—" };
const cnt = { cam: 0, ai: 0, disp: 0 }; let cntT = performance.now(), hudT = 0, noDet = 0;
const ema = (cur, v, k = 0.2) => cur + (v - cur) * k;

const showError = (m, ms = 7000) => { const e = $("error"); e.textContent = m; e.classList.remove("hidden"); clearTimeout(showError.t); if (ms) showError.t = setTimeout(() => e.classList.add("hidden"), ms); };
addEventListener("error", (e) => showError("Lỗi: " + e.message));
addEventListener("unhandledrejection", (e) => showError("Lỗi: " + (e.reason?.message || e.reason)));
const setBtn = (on) => { $("startBtn").classList.toggle("hidden", on); $("stopBtn").classList.toggle("hidden", !on); };

async function ensureModel() {
  if (ai?.ready) return true;
  if (modelPromise) return modelPromise;
  modelPromise = (async () => {
    setText("modelState", "LOAD"); showError("Đang tải AI…", 0);
    const srcs = await pickSources();
    for (const src of srcs) {
      const c = new InferenceClient();
      try { await c.init({ ...src, face: false }); ai = c; break; }
      catch (e) { console.warn("Worker lỗi với nguồn", src.root, e); c.w?.terminate?.(); }
    }
    if (!ai) {
      try { const m = new MainThreadAI(); await m.init(); ai = m; }
      catch (e2) { setText("modelState", "ERR"); showError("Không tải được AI: " + (e2.message || e2)); return false; }
    }
    bindAI(ai); setText("modelState", `${ai.kind}/${ai.delegate}`); $("error").classList.add("hidden"); return true;
  })();
  try { return await modelPromise; }
  finally { modelPromise = null; }
}


function bindAI(client) {
  client.onResult = (m) => onResult(m, client); client.onIdle = () => { if (ai === client) kick(); };
  client.onFailure = client.kind === "WORKER" ? (error) => { void recoverAI(client, error); } : null;
}
async function recoverAI(failedClient, error) {
  if (ai !== failedClient || aiRecovery || failedClient.kind !== "WORKER") return;
  aiRecovery = true; showError("Worker gặp lỗi; đang chuyển sang chế độ dự phòng…", 0);
  console.warn("Worker tracking lỗi, chuyển fallback:", error);
  try {
    const fallback = new MainThreadAI(); await fallback.init();
    if (ai !== failedClient) return;
    ai = fallback; bindAI(fallback); setText("modelState", `${fallback.kind}/${fallback.delegate}`);
    $("error").classList.add("hidden"); kick();
  } catch (e) {
    if (ai === failedClient) ai = null;
    setText("modelState", "ERR"); showError("Worker và chế độ dự phòng đều lỗi: " + (e.message || e), 0);
  } finally { aiRecovery = false; }
}

function cancelPumps() {
  if (rafId && typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafId);
  rafId = 0;
  if (frameCbId != null) {
    if (frameCbKind === "video") video.cancelVideoFrameCallback?.(frameCbId);
    else if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frameCbId);
  }
  frameCbId = null; frameCbKind = "";
}
function resetTracking() {
  for (const s of slots) {
    s.set.reset(); s.g.reset(); s.sw.reset(); s.label = ""; s.swipe = ""; s.swipeT = -1e9;
  }
  ix.clearVisuals?.(slots);
}
function resetTelemetry(now = performance.now()) {
  for (const metric of Object.values(M)) metric.reset();
  Object.assign(T, { stale: 0, cam: 0, infer: 0, th: 0, rtt: 0, filter: 0, render: 0, age: 0, camFps: 0, aiFps: 0, dispFps: 0, dropped: 0, res: "—" });
  cnt.cam = cnt.ai = cnt.disp = 0; cntT = now; hudT = 0; camLag = 25;
  fm.now = 0; fm.cap = 0; fm.pf = 0; fm.n = 0;
  perf.reset(now); perf.applyFx(rend.fx, P.fx); setText("prof", pname);
}
function scheduleFrame(token) {
  if (!running || token !== cameraGeneration) return;
  if (typeof video.requestVideoFrameCallback === "function") {
    frameCbKind = "video";
    frameCbId = video.requestVideoFrameCallback((now, meta) => {
      frameCbId = null; frameCbKind = "";
      if (!running || token !== cameraGeneration) return;
      scheduleFrame(token); // đặt lịch frame kế trước khi xử lý frame hiện tại
      onFrame(now, meta || {}, token);
    });
    return;
  }
  // Fallback cho trình duyệt chưa có rVFC: chỉ xử lý khi currentTime đổi, tránh lặp cùng frame theo nhịp màn hình.
  frameCbKind = "raf";
  frameCbId = requestAnimationFrame((now) => {
    frameCbId = null; frameCbKind = "";
    if (!running || token !== cameraGeneration) return;
    scheduleFrame(token);
    if (video.readyState >= 2 && video.currentTime !== lastFallbackVideoTime) {
      lastFallbackVideoTime = video.currentTime;
      onFrame(now, { presentedFrames: ++fallbackFrameNo }, token);
    }
  });
}
async function startCamera() {
  const token = ++cameraGeneration;
  cameraNeedsRetry = false;
  running = false;
  cancelPumps();
  const oldStream = stream; stream = null;
  oldStream?.getTracks().forEach((t) => t.stop());
  resetTracking(); rend.clear(); resetTelemetry();
  try {
    const [w, h, fps] = P.cam;
    const nextStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: fps, max: fps } } });
    if (token !== cameraGeneration) { nextStream.getTracks().forEach((t) => t.stop()); return; }
    stream = nextStream;
    video.srcObject = nextStream; await video.play();
    if (token !== cameraGeneration) { nextStream.getTracks().forEach((t) => t.stop()); if (stream === nextStream) stream = null; return; }
    const settings = nextStream.getVideoTracks()[0]?.getSettings?.() || {};
    T.res = `${settings.width || video.videoWidth}x${settings.height || video.videoHeight}@${Math.round(settings.frameRate || 0)}`;
    rend.mirrored = facing === "user"; stage.classList.toggle("mirror", rend.mirrored);
    resetTracking();
    lastSubmitPf = -1; fm.n = 0; fallbackFrameNo = 0; lastFallbackVideoTime = -1;
    perfT = performance.now() + PERF.warmupMs;
    $("welcome").classList.add("hidden"); setBtn(true); noDet = 0;
    running = true; lastRaf = performance.now();
    rafId = requestAnimationFrame((t) => loop(t, token));
    scheduleFrame(token);
  } catch (e) {
    if (token !== cameraGeneration) return;
    console.error(e); running = false; cameraNeedsRetry = true; cancelPumps();
    stream?.getTracks().forEach((t) => t.stop()); stream = null;
    try { video.pause(); } catch {}
    video.srcObject = null; rend.clear(); ix.clearVisuals?.(slots);
    setBtn(false); $("welcome").classList.remove("hidden");
    showError("Không mở được camera." + (globalThis.isSecureContext ? " Hãy kiểm tra quyền camera." : " Cần HTTPS hoặc localhost."));
  }
}
function stopCamera() {
  ++cameraGeneration; running = false; cameraNeedsRetry = false; cancelPumps();
  stream?.getTracks().forEach((t) => t.stop()); stream = null;
  try { video.pause(); } catch {}
  video.srcObject = null; resetTracking(); rend.clear(); setBtn(false); $("welcome").classList.remove("hidden");
}

// LATEST-FRAME-WINS: worker chỉ giữ 1 khung. Khung đến khi bận KHÔNG xếp hàng; khi worker xong (onIdle) ta chụp ngay khung MỚI NHẤT đang hiển thị
// (không chờ khung kế → bớt ~½ chu kỳ camera). presentedFrames dùng để không xử lý lại cùng một khung.
function onFrame(now, meta, token) {
  if (!running || token !== cameraGeneration) return;
  cnt.cam++;
  const hasCap = meta.captureTime && Math.abs(meta.captureTime - now) < 500;
  if (hasCap) {                                                    // ĐO THẬT: tuổi khung lúc callback; ƯỚC LƯỢNG: capture→hiển thị
    T.cam = ema(T.cam, now - meta.captureTime);
    if (meta.expectedDisplayTime) camLag = ema(camLag, meta.expectedDisplayTime - meta.captureTime);
  }
  fm.now = now; fm.pf = meta.presentedFrames ?? ++fm.n;                          // trình duyệt không có presentedFrames → đếm callback
  fm.cap = SCHED.useCaptureTime && hasCap ? meta.captureTime : now;   // thời điểm CHỤP dùng cho dt/vận tốc (không có → thời điểm callback)
  if (ai?.busy) T.dropped++; kick();
}
function kick() {
  if (!running || !ai?.ready || document.hidden || ai.busy || fm.pf === lastSubmitPf) return;
  lastSubmitPf = fm.pf; rend.resize(video.videoWidth, video.videoHeight);
  const client = ai;
  try {
    const task = client.submit(video, fm.now, { hands: show.hands, face: false }, fm.cap, cameraGeneration);
    task?.catch?.((error) => {
      if (client !== ai) return;
      if (client.kind === "WORKER") void recoverAI(client, error);
      else { client.ready = false; setText("modelState", "ERR"); showError("Lỗi xử lý AI: " + (error.message || error), 0); }
    });
  } catch (error) {
    if (client.kind === "WORKER") void recoverAI(client, error);
    else { client.ready = false; setText("modelState", "ERR"); showError("Lỗi xử lý AI: " + (error.message || error), 0); }
  }
}

function onResult(m, sourceAI = ai) {
  if (sourceAI !== ai) return; // bỏ callback cũ nếu đã chuyển Worker → fallback
  if (m.session !== undefined && m.session !== cameraGeneration) return; // bỏ kết quả từ camera/session cũ
  cnt.ai++; const t0 = performance.now(); rec.push(m);
  if (m.faceOnly) return;
  if (t0 - m.ts - m.tAll > SCHED.staleMs) { T.stale++; return; }  // chỉ bỏ khi CHỜ/TRUYỀN quá lâu (backlog); AI chậm vẫn phải hiển thị
  T.infer = ema(T.infer, m.tAll); T.th = ema(T.th, m.tHand); M.ai.push(m.tAll);
  T.rtt = ema(T.rtt, t0 - m.ts); M.xfer.push(Math.max(0, t0 - m.ts - m.tAll));
  if (m.tRecv && sourceAI?.tPost) { M.cap.push(sourceAI.cap); M.xout.push(Math.max(0, m.tRecv - sourceAI.tPost)); M.wq.push(Math.max(0, m.tH0 - m.tRecv)); M.back.push(Math.max(0, m.tRes - m.tSend)); }
  assign(m);
  const tracked = slots.find((s) => s.set.has && s.set.miss < TRACK.lostHideMiss);
  const quality = agents.tracking.observe({ detected: !!m.nh, stale: false, landmarks: tracked ? tracked.set._t : null });
  const speed = tracked ? Math.hypot(tracked.set.pv[0], tracked.set.pv[1]) / Math.max(tracked.set.scale, 0.03) : 0;
  agents.gesture.observe(speed, quality.score / 100);
  noDet = m.nh ? 0 : noDet + 1;
  const dt = performance.now() - t0; T.filter = ema(T.filter, dt); M.gest.push(dt);
}

// Gán tay → slot: chi phí = khoảng cách tới vị trí DỰ ĐOÁN theo thời gian thực trôi qua, chuẩn hoá theo kích thước tay (có aspect) + lệch kích thước;
// có GATING (quá xa → coi là tay mới, không cướp danh tính). 2 tay: xét cả hai phép gán, chọn tổng nhỏ nhất.
function assign(m) {
  const aspect = video.videoWidth / video.videoHeight || 1, H = m.hands, dets = [];
  for (let k = 0; k < m.nh; k++) { const o = k * 63; if (Math.hypot((H[o] - H[o + 27]) * aspect, H[o + 1] - H[o + 28]) >= TRACK.minHandSize) dets.push(o); }
  const pick = pickAssignment(dets, H, slots.map((s) => s.set), aspect, m.tc, TRACK);
  const used = new Set();
  dets.slice(0, 2).forEach((o, i) => {
    const s = slots[pick[i]]; used.add(pick[i]);
    if ((m.tc - s.set.last) > FILTER.gapMs) { s.g.reset(); s.sw.reset(); }
    s.set.pushPacked(H, o, m.tc, m.ts);
    const st = s.set, sp = Math.hypot(st.pv[0], st.pv[1]) / Math.max(st.scale, 0.03), ok = st.pe < 0.3 && st.reacq < 0.5;
    s.label = s.g.update(st, aspect, m.tc, sp, ok);
    let px = 0, py = 0; for (const a of [0, 5, 9, 13, 17]) { px += st.x[a * 2]; py += st.x[a * 2 + 1]; }
    const sw = s.sw.push(m.tc, px / 5, py / 5, Math.max(st.scale, 0.03)); if (sw) { s.swipe = rend.mirrored ? ({ L: "R", R: "L" }[sw] || sw) : sw; s.swipeT = performance.now(); }
  });
  slots.forEach((s, i) => { if (!used.has(i)) s.set.miss++; });
}

function loop(raf, token) {
  if (!running || token !== cameraGeneration) return;
  rafId = requestAnimationFrame((t) => loop(t, token)); cnt.disp++;
  const now = performance.now(), dt = Math.min(0.1, (raf - lastRaf) / 1000); lastRaf = raf;
  const r0 = now; rend.clear();
  const lead = (P.predict === "world" ? camLag / 1000 : 0) + 0.004;   // "video": bám khung hình đang hiển thị; "world": bám tay thật (dễ lệch trước video)
  let hands = 0;
  for (const s of slots) {
    const vis = s.vis = show.hands && s.set.has && s.set.miss < TRACK.lostHideMiss; if (vis) hands++;
    s.set.lead = lead; s.set.step(dt, vis, now); rend.hand(s.set, ai?.handConn || [], s.label, now);
  }
  if (hands === 2) rend.lasers(slots[0].set, slots[1].set);
  ix.update(now, slots, rend.mirrored, canvas.width, canvas.height);   // vòng tròn đầu ngón ↔ nút trên màn hình
  const rt = performance.now() - r0; T.render = ema(T.render, rt); M.render.push(rt);
  let age = 0, hasAge = false;
  for (const s of slots) if (s.set.alpha > .3 && s.set.tAge > 0) { age = Math.max(age, now - s.set.tAge); hasAge = true; }
  if (hasAge) { T.age = ema(T.age, age); M.age.push(age); }   // tuổi của track CŨ NHẤT đang hiển thị; không nhiễm số 0 khi chưa có tay
  if (now - perfT > PERF.evalMs) {
    perfT = now;
    const lv = perf.update(now, { aiP95: M.ai.stats().p95, ageP95: M.age.stats().p95, renderP95: M.render.stats().p95 });
    if (lv !== null) applyPerf();
    agents.latency.update({ aiP95: M.ai.stats().p95, ageP95: M.age.stats().p95, renderP95: M.render.stats().p95, dropped: T.dropped, fps: T.aiFps, samples: M.ai.n || 0 });
  }
  if (now - hudT > 250) hud(now, hands);
}

function applyPerf() { perf.applyFx(rend.fx, P.fx); setText("prof", pname + (perf.level ? ` ↓${perf.level}` : "")); }
function hud(now, hands) {
  const dtc = (now - cntT) / 1000; cntT = now; hudT = now;
  T.camFps = cnt.cam / dtc; T.aiFps = cnt.ai / dtc; T.dispFps = cnt.disp / dtc; cnt.cam = cnt.ai = cnt.disp = 0;
  const f = (v) => v.toFixed(1).padStart(5), vs = 500 / Math.max(30, T.dispFps);                 // nửa chu kỳ màn hình (ƯỚC LƯỢNG)
  const total = T.cam + T.age + T.render + vs;
  setText("fps", Math.round(T.dispFps)); setText("lat", T.infer.toFixed(1) + "ms"); setText("hands", hands);
  setText("gest", slots.filter((s) => s.set.alpha > .5).map((s) => s.label + (now - s.swipeT < 700 ? " ↯" + ({ L: "←", R: "→", U: "↑", D: "↓" }[s.swipe] || "") : "")).join(" · ") || "—");
  setText("lead", "~" + Math.round(T.age) + "ms");
  $("tele").textContent =
`PROFILE ${pname}${perf.level ? " ↓" + perf.level : ""} · ${ai?.kind || "-"} · ${T.res}      [ms]  P50/P95/P99/MAX
CAM      ${f(T.cam)}  [đo] tuổi khung lúc callback${T.cam ? "" : " (không có captureTime)"}
CAPTURE  ${f(M.cap.stats().p50)}  ${fmtP(M.cap)}  [đo] createImageBitmap
XFER→W   ${f(M.xout.stats().p50)}  ${fmtP(M.xout)}  [đo] main→worker
AI       ${f(T.infer)}  ${fmtP(M.ai)}  [đo] hand ${T.th.toFixed(1)}
W→MAIN   ${f(M.back.stats().p50)}  ${fmtP(M.back)}  [đo] pack+trả về
POST     ${f(T.filter)}  ${fmtP(M.gest)}  [đo] assign+filter+gesture
RENDER   ${f(T.render)}  ${fmtP(M.render)}  [đo] CPU encode lệnh vẽ
AGE      ${f(T.age)}  ${fmtP(M.age)}  [đo] từ lúc trình chiếu khung → vẽ
EST TOTAL${f(total)}  [ước lượng] cam+age+render+½vsync (CHƯA phải motion-to-photon)
TƯƠNG TÁC ${ix.on ? "BẬT" : "TẮT"} · bấm ${ix.clicks}
FPS cam ${T.camFps.toFixed(0)} · ai ${T.aiFps.toFixed(0)} · hiển thị ${T.dispFps.toFixed(0)} · DROPPED ${T.dropped} · STALE ${T.stale}\nAGENTS latency=${agents.latency.snapshot().state} · tracking=${agents.tracking.snapshot().score}%/${agents.tracking.snapshot().state} · gesture=${agents.gesture.snapshot().mode}\nADVICE ${agents.latency.snapshot().recommendation}`;
  if (noDet > 90) showError("AI chạy nhưng chưa thấy tay — đưa tay vào khung và đủ sáng.", 3000);
}

async function setProfile(n) {
  pname = n; P = PROFILES[n]; perf.applyFx(rend.fx, P.fx); rend.style = P.style; setText("style", STYLES[rend.style]); setText("prof", n);
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

async function requestStart() {
  if (startPromise) return startPromise;
  startPromise = (async () => { await setProfile(pname); if (await ensureModel()) await startCamera(); })();
  try { return await startPromise; } finally { startPromise = null; }
}
$("startBtn").onclick = $("startMain").onclick = requestStart;
$("stopBtn").onclick = stopCamera; $("snapBtn").onclick = snapshot; $("profBtn").onclick = cycleProfile; $("styleBtn").onclick = cycleStyle;
$("handBtn").onclick = () => toggle("hands", $("handBtn"));
const toggleIx = () => { ix.on = !ix.on; $("uiBtn").classList.toggle("off", !ix.on); };
$("uiBtn").onclick = toggleIx;
$("fullBtn").onclick = $("fullMain").onclick = full;
$("switchBtn").onclick = () => { facing = facing === "user" ? "environment" : "user"; if (running || cameraNeedsRetry) return startCamera(); };
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "f") full(); else if (k === "c") $("switchBtn").click(); else if (k === "s") snapshot(); else if (k === "v") cycleStyle(); else if (k === "i") toggleIx();
  else if (k === "p") cycleProfile(); else if (k === "t") $("tele").classList.toggle("hidden"); else if (k === "r") { if (!rec.toggle() && rec.rows.length) { const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([rec.toJSONL()], { type: "application/jsonl" })), download: `replay-${Date.now()}.jsonl` }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); } showError(rec.on ? "● Đang ghi replay (R để dừng + tải)" : "Đã lưu replay", 2500); } else if (k === "h") $("handBtn").click();
});
