import { InferenceClient, MainThreadAI, MicroHandposeClient, pickSources } from "./inference.js";
import { SmoothSet } from "./smoothing.js";
import { GestureTracker, SwipeDetector } from "./gesture.js";
import { Renderer, STYLES } from "./renderer.js";
import { RENDER_URL, PROFILES, DEFAULT_PROFILE, FILTER, TRACK, SCHED, PERF, INTERACT } from "./config.js";
import { Interact } from "./interact.js";
import { Metric, fmtP, Recorder } from "./telemetry.js";
import { PerfController } from "./perf.js";
import { pickAssignment } from "./tracking.js";
import { AIAgentSuite } from "./ai-agents.js";
import { AgentOrchestrator, ABBenchmark, InterruptibleWait } from "./agent-orchestrator.js";

const $ = (id) => document.getElementById(id), setText = (id, t) => { const e = $(id); if (e) e.textContent = t; };
const video = $("video"), canvas = $("overlay"), stage = $("stage"), rend = new Renderer(canvas);
const common = { maxH: FILTER.maxHorizon, gapMs: FILTER.gapMs, reacqMs: FILTER.reacqRampMs, soft: FILTER.outlierSoft, hard: FILTER.outlierHard };
const slots = [0, 1].map(() => ({ set: new SmoothSet(21, { ...FILTER.hand, ...common }), label: "", g: new GestureTracker(), sw: new SwipeDetector(), swipe: "", swipeT: -1e9 }));
const M = Object.fromEntries(["ai", "age", "render", "xfer", "cap", "xout", "wq", "back", "gest"].map((k) => [k, new Metric()]));
const rec = new Recorder(), perf = new PerfController(PERF), agents = new AIAgentSuite(), domainAgents = new AgentOrchestrator(), abBench = new ABBenchmark(), abWait = new InterruptibleWait(); let perfT = 0, lastSubmitPf = -1, fm = { now: 0, cap: 0, pf: 0, n: 0 };
let ai = null, activeModel = "mediapipe", modelPromise = null, startPromise = null, aiRecovery = false, abPromise = null, backendStatus = "UNKNOWN", databaseStatus = "unknown", jobsStatus = "ok", panelOpen = false, lastAgentUi = 0, pname = DEFAULT_PROFILE, P = PROFILES[pname], stream = null, running = false, facing = "user", lastRaf = 0, camLag = 25;
let cameraGeneration = 0, cameraNeedsRetry = false, rafId = 0, frameCbId = null, frameCbKind = "", fallbackFrameNo = 0, lastFallbackVideoTime = -1, lastMetricsPostAt = 0, metricsPostBusy = false;
const show = { hands: true };
const ix = new Interact(canvas, INTERACT, () => document.querySelectorAll(INTERACT.selector));
globalThis.__skel = { slots, fm, ix, agents: domainAgents, abBench };
Object.defineProperty(globalThis.__skel, "running", { get: () => running }); // phục vụ test/E2E & gỡ lỗi trong Console
const T = { stale: 0, cam: 0, infer: 0, th: 0, rtt: 0, filter: 0, render: 0, age: 0, camFps: 0, aiFps: 0, dispFps: 0, dropped: 0, res: "—" };
const cnt = { cam: 0, ai: 0, disp: 0 }; let cntT = performance.now(), hudT = 0, noDet = 0;
const ema = (cur, v, k = 0.2) => cur + (v - cur) * k;

const showError = (m, ms = 7000) => { const e = $("error"); e.textContent = m; e.classList.remove("hidden"); clearTimeout(showError.t); if (ms) showError.t = setTimeout(() => e.classList.add("hidden"), ms); };
addEventListener("error", (e) => showError("Lỗi: " + e.message));
addEventListener("unhandledrejection", (e) => showError("Lỗi: " + (e.reason?.message || e.reason)));
const setBtn = (on) => { $("startBtn").classList.toggle("hidden", on); $("stopBtn").classList.toggle("hidden", !on); };

async function createMediaPipeClient() {
  const srcs = await pickSources();
  for (const src of srcs) {
    const c = new InferenceClient();
    try { await c.init({ ...src, face: false }); c.modelId = "mediapipe"; return c; }
    catch (e) { console.warn("Worker lỗi với nguồn", src.root, e); c.w?.terminate?.(); }
  }
  const fallback = new MainThreadAI(); await fallback.init(); fallback.modelId = "mediapipe"; return fallback;
}
async function ensureModel(modelId = activeModel) {
  if (ai?.ready && ai.modelId === modelId) return true;
  if (modelPromise?.modelId === modelId) return modelPromise.promise;
  const promise = (async () => {
    setText("modelState", "LOAD"); setText("activeModelLabel", modelId === "micro" ? "Model B · WebGPU" : "Model A · MediaPipe");
    if (modelId === "micro") {
      const c = new MicroHandposeClient(); await c.init(); c.modelId = "micro"; activateAI(c, modelId); return true;
    }
    let c;
    try { c = await createMediaPipeClient(); }
    catch (e) { setText("modelState", "ERR"); showError("Không tải được MediaPipe: " + (e.message || e), 0); return false; }
    activateAI(c, modelId); return true;
  })();
  modelPromise = { modelId, promise };
  try { return await promise; }
  catch (e) { setText("modelState", "ERR"); throw e; }
  finally { if (modelPromise?.promise === promise) modelPromise = null; }
}
function activateAI(client, modelId) {
  const previous = ai;
  ai = client; activeModel = modelId; client.modelId = modelId;
  bindAI(client);
  if (previous && previous !== client) { try { previous.terminate?.(); previous.w?.terminate?.(); } catch {} }
  if (running) { resetTracking(); for (const k of ["ai", "age", "xfer", "cap", "xout", "wq", "back", "gest"]) M[k].reset(); }
  setText("modelState", `${modelId === "micro" ? "MICRO" : client.kind}/${client.delegate || "?"}`);
  setText("activeModelLabel", modelId === "micro" ? "Model B · WebGPU" : "Model A · MediaPipe");
  setText("modelSwitchBtn", modelId === "micro" ? "Dùng Model A · MediaPipe" : "Thử Model B · WebGPU");
}
async function switchModel(modelId, { reportError = true } = {}) {
  if (modelId !== "micro" && modelId !== "mediapipe") throw new Error("Unknown model");
  if (modelId === activeModel && ai?.ready) return true;
  if (modelId === "micro" && !navigator.gpu) {
    const msg = "Thiết bị/trình duyệt không cung cấp WebGPU; vẫn giữ Model A (MediaPipe).";
    setText("abStatus", msg); if (reportError) showError(msg, 6000); return false;
  }
  const previous = activeModel;
  try {
    const ok = await ensureModel(modelId);
    if (!ok) throw new Error("Không khởi tạo được model " + modelId);
    resetTracking(); lastSubmitPf = -1; fm.pf = -1;
    setText("abStatus", modelId === "micro" ? "Model B đang chạy trên WebGPU (thử nghiệm)" : "Model A đang chạy trên MediaPipe");
    if (running) kick();
    return true;
  } catch (e) {
    console.warn("Model switch failed", modelId, e);
    if (modelId === "micro") {
      activeModel = previous; setText("abStatus", "Model B lỗi; quay lại MediaPipe. " + (e.message || e));
      if (reportError) showError("Model B không khởi động được; tiếp tục dùng MediaPipe. " + (e.message || e), 7000);
      if (!ai?.ready || ai.modelId !== "mediapipe") { ai = null; try { await ensureModel("mediapipe"); } catch {} }
    } else if (reportError) showError("Không chuyển được model: " + (e.message || e), 7000);
    return false;
  }
}
function bindAI(client) {
  client.onResult = (m) => onResult(m, client); client.onIdle = () => { if (ai === client) kick(); };
  client.onFailure = (error) => { void recoverAI(client, error); };
}
async function recoverAI(failedClient, error) {
  if (ai !== failedClient || aiRecovery) return;
  aiRecovery = true; showError("Model gặp lỗi; đang chuyển về MediaPipe dự phòng…", 0);
  console.warn("Tracking model failed:", error);
  const failedModel = failedClient.modelId || activeModel;
  try {
    if (failedModel === "micro") {
      if (abBench.active) { abBench.active = false; setText("abStatus", "A/B dừng vì Model B gặp lỗi; đã chuyển về MediaPipe."); }
      try { failedClient.terminate?.(); failedClient.w?.terminate?.(); } catch {}
      ai = null; activeModel = "mediapipe";
      const ok = await ensureModel("mediapipe"); if (!ok) throw new Error("Không khởi tạo được MediaPipe fallback");
    } else if (failedClient.kind === "WORKER") {
      const fallback = new MainThreadAI(); await fallback.init(); fallback.modelId = "mediapipe";
      if (ai !== failedClient) return;
      activateAI(fallback, "mediapipe");
    } else throw error;
    setText("abStatus", "Đã dùng MediaPipe dự phòng sau lỗi model"); $("error").classList.add("hidden"); if (running) kick();
  } catch (e) {
    if (ai === failedClient) ai = null;
    setText("modelState", "ERR"); showError("Model chính và fallback đều lỗi: " + (e.message || e), 0);
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
  // Camera flip/profile restart invalidates A/B samples from the previous capture stream.
  if (abBench.active) stopABBenchmark();
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
  stopABBenchmark();
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
      if (client.kind === "WORKER" || client.kind === "MICRO") void recoverAI(client, error);
      else { client.ready = false; setText("modelState", "ERR"); showError("Lỗi xử lý AI: " + (error.message || error), 0); }
    });
  } catch (error) {
    if (client.kind === "WORKER" || client.kind === "MICRO") void recoverAI(client, error);
    else { client.ready = false; setText("modelState", "ERR"); showError("Lỗi xử lý AI: " + (error.message || error), 0); }
  }
}

function onResult(m, sourceAI = ai) {
  if (sourceAI !== ai) return; // bỏ callback cũ nếu đã chuyển Worker → fallback
  if (m.session !== undefined && m.session !== cameraGeneration) return; // bỏ kết quả từ camera/session cũ
  cnt.ai++; const t0 = performance.now(); rec.push(m);
  if (m.faceOnly) return;
  if (t0 - m.ts - m.tAll > SCHED.staleMs) { T.stale++; return; }  // bỏ output đã quá cũ; không tính là frame hiển thị thành công
  if (abBench.active && sourceAI?.modelId) abBench.record(sourceAI.modelId, { latency: m.tAll, detected: !!m.nh, age: Math.max(0, t0 - (Number.isFinite(m.tc) ? m.tc : m.ts)), now: t0 });
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
    const aiP95 = M.ai.stats().p95, ageP95 = M.age.stats().p95, renderP95 = M.render.stats().p95, samples = M.ai.n || 0;
    agents.latency.update({ aiP95, ageP95, renderP95, dropped: T.dropped, fps: T.aiFps, samples });
    const q = agents.tracking.snapshot();
    const health = agents.modelHealth.observe({ delegate: ai?.delegate || 'UNKNOWN', aiP95, ageP95, missRate: q.missRate, samples });
    const adaptive = agents.adaptiveConfig.recommend({ aiP95, ageP95, renderP95, trackingScore: q.score, delegate: ai?.delegate || 'UNKNOWN', samples });
    setText('agentLatency', agents.latency.snapshot().state); setText('agentLatencyHint', agents.latency.snapshot().recommendation);
    setText('agentTracking', `${q.score}%`); setText('agentTrackingHint', `${q.state} · mất ${(q.missRate * 100).toFixed(0)}%`);
    setText('agentMotion', agents.gesture.snapshot().mode); setText('agentMotionHint', `speed ${agents.gesture.snapshot().speed} · stability ${agents.gesture.snapshot().stability}`);
    setText('agentHealth', health.state); setText('agentHealthHint', health.reason);
    setText('agentConfig', adaptive.profile); setText('agentConfigHint', adaptive.action);
    const allMetrics = { cameraFps:T.camFps, aiP95, ageP95, renderP95, droppedRate:T.dropped/Math.max(1,T.dropped+cnt.ai), missRate:q.missRate, score:q.score, speed:agents.gesture.snapshot().speed, handsFlips:0, interactionEnabled:ix.on, clicks:ix.clicks, perfLevel:perf.level, samples, backend:backendStatus, database:databaseStatus, jobs:jobsStatus, fallback:ai?.kind==='MAIN', model:activeModel };
    if (running && $("metricsConsent")?.checked && !metricsPostBusy && now - lastMetricsPostAt >= 60000) {
      lastMetricsPostAt = now; void persistAggregateMetrics({ aiP95, ageP95, renderP95, cameraFps:T.camFps, aiFps:T.aiFps, displayFps:T.dispFps, dropped:T.dropped, stale:T.stale, delegate:ai?.delegate || ai?.kind || "unknown", profile:pname });
    }
    const agentView = domainAgents.observe(allMetrics, now);
    setText('agentSummary', `${agentView.agents.length} managers · ${agentView.review.state} · ${agentView.review.warnings} cảnh báo`);
    if (panelOpen && now - lastAgentUi > 1400) { lastAgentUi = now; renderAgentCards(agentView); }
    const slowScore = q.score, currentSpeed = agents.gesture.snapshot().speed;
    const nextBeta = slowScore < 50 ? 40 : currentSpeed > 1.3 ? 46 : currentSpeed < .22 && slowScore > 75 ? 30 : 38;
    for (const slot of slots) slot.set.cfg.beta += (nextBeta - slot.set.cfg.beta) * 0.25;
    setText('selfReview', agentView.review.issues.join(' '));
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
`PROFILE ${pname}${perf.level ? " ↓" + perf.level : ""} · ${activeModel.toUpperCase()} / ${ai?.kind || "-"} · ${T.res}      [ms]  P50/P95/P99/MAX
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
FPS cam ${T.camFps.toFixed(0)} · ai ${T.aiFps.toFixed(0)} · hiển thị ${T.dispFps.toFixed(0)} · DROPPED ${T.dropped} · STALE ${T.stale}\nAGENTS ${domainAgents.snapshot().agents.length} managers · latency=${agents.latency.snapshot().state} · tracking=${agents.tracking.snapshot().score}%/${agents.tracking.snapshot().state} · gesture=${agents.gesture.snapshot().mode} · model=${agents.modelHealth.snapshot().state} · config=${agents.adaptiveConfig.snapshot().profile}\nSELF-REVIEW ${domainAgents.snapshot().review.safeAction} · ADVICE ${agents.latency.snapshot().recommendation}`;
  if (noDet > 90) showError("AI chạy nhưng chưa thấy tay — đưa tay vào khung và đủ sáng.", 3000);
}

async function setProfile(n) {
  if (abBench.active) stopABBenchmark();
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
async function persistAggregateMetrics(metrics) {
  if (!RENDER_URL || metricsPostBusy || !$("metricsConsent")?.checked) return;
  metricsPostBusy = true;
  try {
    const response = await fetch(`${RENDER_URL}/api/sessions/metrics`, {
      method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metrics }), signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    setText("serviceStatus", `API ${backendStatus} · DB ${databaseStatus} · đã lưu số liệu tổng hợp`);
  } catch (error) {
    console.warn("Aggregate metrics not saved:", error?.message || error);
    // Database/backend health must never stop local camera tracking.
  } finally { metricsPostBusy = false; }
}

async function pingRender() {
  if (!RENDER_URL) { setText("ping", "—"); backendStatus = "UNKNOWN"; return; }
  const t = performance.now();
  try { const r = await fetch(`${RENDER_URL}/ping?t=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(8000) }); setText("ping", r.ok ? Math.round(performance.now() - t) + "ms" : "lỗi"); backendStatus = r.ok ? "OK" : "DOWN"; } catch { setText("ping", "đang dậy…"); backendStatus = "WAKING"; }
}
pingRender(); setInterval(pingRender, 60000);
async function refreshServiceStatus() {
  if (!RENDER_URL) return;
  try { const r = await fetch(`${RENDER_URL}/api/status`, { cache: "no-store", signal: AbortSignal.timeout(4500) }); if (!r.ok) throw new Error("status http"); const d = await r.json(); databaseStatus = d.database || "unknown"; jobsStatus = d.database === "error" ? "error" : "ok"; setText("serviceStatus", `API ${backendStatus} · DB ${databaseStatus}`); }
  catch { databaseStatus = "unknown"; jobsStatus = "error"; setText("serviceStatus", `API ${backendStatus} · DB chưa xác minh`); }
}
refreshServiceStatus(); setInterval(refreshServiceStatus, 45000);

function renderAgentCards(view = domainAgents.snapshot()) {
  const grid = $("agentGrid"); if (!grid) return;
  const existing = new Map([...grid.children].map(el => [el.dataset.id, el]));
  for (const agent of view.agents) {
    let el = existing.get(agent.id);
    if (!el) { el = document.createElement("div"); el.className = "agent-entry"; el.dataset.id = agent.id; el.innerHTML = '<div class="agent-entry-head"><b class="agent-name"></b><span class="agent-state"></span></div><p class="agent-message"></p>'; grid.appendChild(el); }
    el.querySelector(".agent-name").textContent = agent.name; el.querySelector(".agent-state").textContent = agent.state; el.querySelector(".agent-message").textContent = agent.message; el.dataset.state = agent.state;
  }
  $("selfReview").textContent = view.review.issues.join(" ");
}
function reportText(report) {
  const row = (label, r) => `${label.padEnd(10)} P50 ${r.aiP50 == null ? "—" : r.aiP50 + "ms"} · P95 ${r.aiP95 == null ? "—" : r.aiP95 + "ms"} · AGE P95 ${r.ageP95 == null ? "—" : r.ageP95 + "ms"} · detection ${r.detectionRate == null ? "—" : r.detectionRate + "%"} · n=${r.samples}`;
  const a = report.mediapipe, b = report.micro;
  const delta = a.aiP95 != null && b.aiP95 != null ? `\nChênh P95: ${+(b.aiP95-a.aiP95).toFixed(2)}ms (âm = Model B nhanh hơn).` : "\nChưa đủ mẫu; thử lại khi camera ổn định.";
  return `${row("A MediaPipe", a)}\n${row("B WebGPU", b)}${delta}\nLưu ý: benchmark này đo inference và tuổi kết quả trong trình duyệt; không phải motion-to-photon.`;
}
async function waitAB(ms) {
  const until = performance.now() + ms;
  while (abBench.active && performance.now() < until) await abWait.sleep(Math.min(250, until - performance.now()));
}
async function startABBenchmark() {
  if (abPromise) return abPromise;
  if (!navigator.gpu) { setText("abStatus", "WebGPU không sẵn có. Model A vẫn hoạt động; không chạy A/B."); showError("A/B cần Chrome Android có WebGPU khả dụng. Model A không bị thay đổi.", 7000); return; }
  abPromise = (async () => {
    try {
      if (!running) await requestStart();
      if (!running || !ai?.ready) throw new Error("Camera/model chưa sẵn sàng");
      abBench.start(performance.now()); $("abBtn").textContent = "Dừng A/B"; $("abStatus").textContent = "Chuẩn bị benchmark…"; $("abReport").textContent = "Đang đo trên thiết bị này; kết quả trước đó đã được xóa.";
      for (const model of ["mediapipe", "micro"]) {
        if (!abBench.active) break;
        const ok = await switchModel(model, { reportError: false });
        if (!ok) throw new Error(model === "micro" ? "Model B không khởi động được; xem WebGPU/CDN. MediaPipe vẫn dùng được." : "Không khởi động được Model A");
        abBench.beginPhase(model, performance.now());
        $("abStatus").textContent = `${model === "mediapipe" ? "A · MediaPipe" : "B · WebGPU micro-handpose"}: warm-up 1,8s rồi đo trong 10s`;
        await waitAB(11800);
        if (model === "mediapipe" && abBench.active) abBench.phase = "SWITCHING_B";
      }
      if (abBench.active) {
        const report = abBench.finish(performance.now()); $("abReport").textContent = reportText(report);
        $("abStatus").textContent = "Hoàn tất. So sánh P95 và detection rate; không chỉ xem P50.";
        await switchModel("mediapipe", { reportError: false }); // benchmark không thay đổi model mặc định
      } else { $("abStatus").textContent = "Đã dừng benchmark; báo cáo chỉ chứa các mẫu hợp lệ đã thu được."; $("abReport").textContent = reportText(abBench.report()); }
    } catch (e) {
      abBench.active = false; $("abReport").textContent = reportText(abBench.report()); $("abStatus").textContent = e.message || String(e); showError(e.message || String(e), 7000);
    } finally {
      abWait.cancel();
      // A/B is diagnostic only: always return to the stable model, including user cancellation.
      if (activeModel !== "mediapipe") await switchModel("mediapipe", { reportError: false });
      abPromise = null; $("abBtn").textContent = "Chạy A/B (~24s)";
    }
  })();
  return abPromise;
}
function stopABBenchmark() { abBench.active = false; abWait.cancel(); }
async function toggleModel() {
  if (abBench.active) { setText("abStatus", "Dừng A/B trước khi chuyển model thủ công."); return; }
  const next = activeModel === "mediapipe" ? "micro" : "mediapipe";
  const ok = await switchModel(next);
  if (!ok && next === "micro") setText("modelState", ai ? `${activeModel.toUpperCase()}/${ai.delegate || ai.kind}` : "OFF");
}
async function requestStart() {
  if (startPromise) return startPromise;
  startPromise = (async () => { await setProfile(pname); if (await ensureModel()) await startCamera(); })();
  try { return await startPromise; } finally { startPromise = null; }
}
$("startBtn").onclick = $("startMain").onclick = requestStart;
$("labBtn").onclick = () => { panelOpen = !panelOpen; $("aiPanel").classList.toggle("hidden", !panelOpen); if (panelOpen) renderAgentCards(); }; $("closeLabBtn").onclick = () => { panelOpen = false; $("aiPanel").classList.add("hidden"); };
$("modelSwitchBtn").onclick = toggleModel; $("abBtn").onclick = () => abBench.active ? stopABBenchmark() : startABBenchmark();
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
