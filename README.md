# Skeleton v20.5 — tối ưu độ trễ ưu tiên

Focus: realtime hand tracking on Android, frame freshness, smooth rendering, model A/B benchmarks, and non-blocking Render/PostgreSQL maintenance tasks.

## What's new in v18

- **15 specialist managers + 1 self-review manager (16 total):** camera/capture, model, scheduler, tracking, smoothing, identity, gesture, fingertip interaction, renderer, performance, telemetry, Render API, PostgreSQL, jobs, reliability, plus cross-agent contradiction review. These are cheap, deterministic rule-based supervisors—not 16 extra neural networks—and do not run inference in the camera-frame loop.
- **Adaptive smoothing:** bounded adjustment of One Euro `beta` according to movement speed and tracking score; changes ease toward a target rather than jump frame-to-frame.
- **Model A/B:** Model A is the existing MediaPipe GPU-first/CPU fallback. Model B is an experimental `@svenflow/micro-handpose@0.3.0` WebGPU module worker, loaded only when selected. It measures model inference P50/P95, capture-to-result age P95, detection rate, and sample count on the same camera/device. Benchmark warms each model for 1.8 s, measures each phase for 10 s, and restores MediaPipe even when stopped/cancelled. The experiment may fail due to WebGPU, CDN/CORS, memory or browser support; in that case MediaPipe stays/restores as fallback.
- **Latest-frame-wins stays:** at most one frame per model worker; stale inference results do not queue up. Render updates continue independently.
- **Backend safety:** PostgreSQL stores aggregate metrics and queued jobs only; no frames, camera images or landmarks are sent to the server. Uploading summary metrics is **off by default**; it requires the user to check a consent box and then sends a summary at most once per 60 seconds while tracking. `/api/status`, `/healthz`, `/version.json`; HTML uses `no-store` to reduce stale-deployment confusion.
- **Dedicated Render job worker:** jobs run in `jobs-worker.js`, not the web request process. `FOR UPDATE SKIP LOCKED`, bounded kinds/payloads, retries, and stale-running recovery.
- **API controls:** metrics ingestion rate limit, bounded JSON body and metric validation, admin-token guard for job management, security response headers.


## What's new in v20.1 — gesture recognition and actions

- Finger poses combine PIP joint angles and fingertip-to-MCP length normalized to palm width, with hysteresis to avoid flickering labels as the hand rotates.
- Thumb-angle/span logic distinguishes `Súng`, `Chỉ tay`, `Like`, `Mở bàn tay`, `OK` and `Pinch` more intentionally. Ambiguous poses are labelled `Chưa rõ` and cannot trigger an action.
- An in-app **HƯỚNG DẪN CỬ CHỈ** panel shows how to pose and move the hand for each effect. Gun requires a confirmed gun pose followed by a fast 18% palm-scale increase; the cracked-glass overlay persists for 3 seconds. Pull back slightly to re-arm.
- Model detection/presence/tracking thresholds are aligned to MediaPipe's standard 0.5 defaults in both main-thread and worker model initialization.
- The live HUD shows `POSE` average JavaScript geometry-classification time; press `T` to open diagnostics with `POSE` P50/P95/P99 separately from `AI` inference and `POST` pipeline time. Run `npm run bench:gesture` for a quick Node microbenchmark. These do not substitute for live Android browser measurements.
- `OK` is now semantically distinct from pinch-click: touch thumb/index tips and extend the other three fingers for the target-ring effect; pinch over a UI button remains an immediate one-shot click.

## Local run

```bash
npm install
npm start
```

Open `http://localhost:3000`; grant camera permission. Click **LAB** to open Performance Lab. The stable baseline is MediaPipe. Try Model B or run A/B only if WebGPU is available. Model B is an experiment, not an automatic replacement.

With PostgreSQL locally, set `DATABASE_URL`. For local-only job execution, set `RUN_INLINE_JOBS=true`; in production use the dedicated background worker below.

## Render deployment

1. Push this folder to the repository used by Render.
2. Choose **New → Blueprint** and point it at `render.yaml`.
3. Set `ADMIN_TOKEN` to a long random secret. Set `ALLOWED_ORIGIN` to your exact web origin(s), comma-separated; use `*` only if public cross-origin access is deliberate. The old hard-coded URL to an unrelated app was removed: if the front end is not itself served from Render, set `window.SKELETON_CONFIG.renderUrl` in the inline configuration block in `public/index.html` to your own Skeleton Render URL. Leave it blank if no separate backend should be contacted.
4. The Blueprint declares a Free web service, a PostgreSQL database (`basic-256mb`), and a Starter background worker. **The database and Starter worker are paid resources and can incur charges**; review current Render pricing and plans before applying the Blueprint. If you don't want a separate worker, deploy only the web service and run `RUN_INLINE_JOBS=true` (less isolated; not recommended for heavier jobs).
5. Verify `/version.json`, `/healthz` and `/api/status` after deploy. Hard refresh once; the HTML document is configured not to be cached.

## API

- `GET /ping`: fast liveness endpoint for Render wake-up/RTT checks.
- `GET /healthz`: DB-aware service health. It reports `starting` while schema initialization is retrying.
- `GET /version.json`: active deployed version/build.
- `GET /api/status`: version, database status and queued/failed job counts.
- `POST /api/sessions/metrics`: accepts coarse summary metrics only, rate-limited. Client must send this explicitly; camera frames are never uploaded.
- `POST /api/jobs` and `GET /api/jobs/:id`: require `Authorization: Bearer $ADMIN_TOKEN`. Allowed kinds: `cleanup_metrics`, `rebuild_stats`, `health_check`.

## Measuring latency on Android

1. Use the exact same device, camera, room lighting, hand distance and browser tab; keep power mode the same and avoid recording/screen casting.
2. Start the camera and wait 5 seconds for warm-up.
3. Open **LAB → Chạy A/B**. The test excludes the first 1.8 seconds of each model phase and collects the next 10 seconds. Loading/cold-start time is not mixed into inference P95.
4. Compare **P95** and detection rate, not only average/P50. A faster model with a worse detection rate is not automatically better.
5. Repeat at least three times. WebGPU results vary by Android version, chipset, Chrome build and thermal throttling.
6. This benchmark measures inference and the age of returned results. It does **not** measure true motion-to-photon latency; that requires external high-speed video/LED instrumentation or a validated end-to-end method.

The previous and candidate models are not executed simultaneously, to avoid contention and memory pressure. A/B phases are sequential; repeat runs to control for warming/thermal bias.

## Source-driven research / design decisions

The reasoning trail, mapping of each feature to its sources, and self-critique/fix log are in [`docs/V18_RESEARCH_AND_SELF_CRITIQUE.md`](docs/V18_RESEARCH_AND_SELF_CRITIQUE.md).

1. Google MediaPipe Hand Landmarker Web docs: `detectForVideo()` is synchronous on the calling thread; using a worker protects UI responsiveness.
2. `requestVideoFrameCallback()` supplies video-frame timing metadata and is preferred over arbitrary `timeupdate`/display callbacks.
3. Transferable `ImageBitmap` reduces copying across worker boundaries.
4. `OffscreenCanvas` is a browser-supported path for worker-side canvas processing where applicable.
5. One Euro Filter provides speed-adaptive low-pass filtering to trade jitter against lag.
6. `micro-handpose` 0.3.0: WebGPU, ROI tracking and 21 normalized hand landmarks; upstream benchmarks are vendor-published, not Android results for this app.
7. `webgpu-vision`: a separate WebGPU/ONNX Runtime Web architecture and explicit benchmark/A-B harness to compare against.
8. TensorFlow.js hand-pose detection offers lite/full trade-offs and WebGL/MediaPipe runtimes; kept as a future alternative rather than loaded in parallel now.
9. WebGPU support varies by browser/OS/GPU; capability detection and a MediaPipe fallback are mandatory.
10. Render Background Workers isolate queued asynchronous work from web request handling.
11. Render Cron Jobs fit periodic cleanup/maintenance tasks; not per-frame work.
12. Render Postgres connection pooling helps only for matching connection/concurrency patterns; camera inference must not depend on DB.
13. PostgreSQL `SKIP LOCKED` is used for concurrent-safe work claiming and avoids two workers claiming the same queue item.
14. `PerformanceObserver` and browser performance timing APIs can extend client telemetry; sample/aggregate rather than send every frame.
15. Express guidance recommends limiting request body sizes, guarding admin routes, and rate limiting public endpoints.

References:
- https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js
- https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback
- https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas
- https://github.com/svenflow/micro-handpose
- https://github.com/Sonified/webgpu-vision
- https://github.com/tensorflow/tfjs-models/tree/master/hand-pose-detection
- https://web.dev/blog/webgpu-supported-major-browsers
- https://render.com/docs/background-workers
- https://render.com/docs/cronjobs
- https://render.com/docs/postgresql-connection-pooling
- https://www.postgresql.org/docs/current/sql-select.html
- https://expressjs.com/en/advanced/best-practice-security.html

## Verification status

Historical v19.5 verification snapshot: 48/48 unit/contract tests pass; 9/9 simulated E2E scenarios pass; `npm run bench` and `npm run sweep` run deterministic simulations. The container had no `node_modules`, and `npm install --no-audit --no-fund` timed out, so a live Express/PostgreSQL smoke test was not run here. Node tests and simulated E2E can verify logic/contract regressions; they cannot establish camera motion-to-photon latency or validate WebGPU on your Android device. Model B is therefore visibly marked experimental until the on-device A/B report confirms both latency and detection rate.


## WonderSnap 3D mode (v19)

The Render web build vendors the MIT-licensed [WonderSnap project](https://github.com/AkbarSheikh-debug/wondersnap) and serves it at `/wondersnap/`. Use the WONDER link in the main screen. On Android, stop Skeleton tracking before starting WonderSnap to avoid two concurrent camera/GPU loops. See `docs/WONDERSNAP_INTEGRATION.md`.


### v19.1 embedded WonderSnap and camera lifecycle

The WONDER control opens the WonderSnap experience in an embedded full-screen overlay. Skeleton releases its camera before entering and requests it again on return. On initial page entry it calls the existing camera startup path to request permission; browser permission policy is still respected. PostgreSQL receives aggregate metrics only and is never used for per-frame inference. See `docs/WONDERSNAP_INTEGRATION.md`.


## v19.2 self-audit and WonderSnap performance (historical; startup overrides removed in v19.5)

- The deployment vendor step runs `scripts/verify-wondersnap-models.mjs` against every upstream catalog model. Each model is built with a deterministic low-count sample and its target/offset/tint/pick buffers plus fit scale are checked for shape and finite values. This catches procedural model/build-data errors, but cannot prove every GPU will render it correctly.
- WonderSnap installs its own declared MediaPipe Tasks Vision runtime under `wondersnap/node_modules`; Skeleton keeps its existing pinned runtime.
- Earlier versions chose particle/DPR tiers from touch, CPU-core and memory hints. This heuristic was removed in v19.5 so WONDER uses the same upstream defaults as `/wondersnap/` opened directly. Coarse FPS, measured inference time and particle count are reported to the parent once per second; no raw frame telemetry is sent.
- PostgreSQL remains outside the camera loop. The normal Skeleton metrics path is opt-in and aggregate-only; 500 images/frames per second are not sent to PostgreSQL.
- These checks are Node unit/contract tests and deterministic procedural model smoke builds, not a real-device Android benchmark or visual GPU certification.

## v19.5 — Upstream WonderSnap parity and latency validation

- Uses the upstream `AkbarSheikh-debug/wondersnap` source at Render build time and keeps its runtime isolated under `/wondersnap/`.
- Removes decorative WonderSnap landmark dots and fingertip/dwell rings while preserving pointer positions, gesture detection, hit-testing, dwell timers, and pinch actions.
- Restores WonderSnap upstream defaults for particle count, DPR, trails, and camera constraints; the previous Skeleton-specific overrides were not backed by a reliable Android latency comparison and did not match the direct route.
- Keeps once-per-second FPS/inference diagnostics and validates model catalog builds during deployment. These diagnostics do not measure end-to-end motion-to-photon latency; confirm the result on the same device/browser against `/wondersnap/` directly.


## v20.0 — Three-stage engineering upgrade

### Stage 1: reliability and security baseline
- Pinned the project release version to 20.0.0 and added bounded REST signaling for short-lived rooms (maximum two participants, peer validation, rate limits, bounded SDP/ICE payloads, no media relay).
- Added local-only gesture effects; camera frames and landmarks are not sent to the server for gesture recognition.
- Keep the upstream WonderSnap vendor step; for reproducible production builds, pin its source commit before deployment.

### Stage 2: real-device performance
- Existing latest-frame-wins, worker inference, smoothing and telemetry remain intact.
- Validate camera permissions, WebRTC latency and WebGL2 performance on target Android devices; simulated tests alone do not establish real-device performance.

### Stage 3: interactive features
- Added an in-app one-to-one video meeting: create a room, share the invite link or 16-character room ID, join, toggle camera/microphone, and leave. The hand-tracking camera is stopped while meeting mode is active to avoid camera contention and resumed when the meeting closes. Pending app startup is invalidated too.
- Added gesture reactions: index + thumb in a finger-gun pose followed by a rapid forward hand movement triggers a 3-second glass-crack overlay; V-sign produces rainbow + confetti, open palm creates an energy burst, Like creates hearts, fist creates a shockwave, and a fast swipe creates a light slash. The gesture label now distinguishes finger-gun from pointing. These heuristics are approximate and depend on lighting, framing and camera perspective.
- Current v20 source tests: 66/66 Node test cases passed, including 5 meeting-hub tests; simulated E2E scenarios also pass. This is a source-level test result, not a live two-device call or Render build certification.

### Deployment notes
- `npm install` installs the declared project dependencies; no separate WebSocket package is required for meeting signaling. Render must deploy the updated `package.json` and `server.js`.
- WebRTC uses a public STUN server for peer discovery. Some NATs/firewalls require a TURN server; configure one for dependable calls across restrictive networks. The REST signaling service does not forward media.
- Camera/microphone calls require HTTPS (Render provides HTTPS). Browser permissions must be granted by each participant. Room codes are ephemeral and are not user authentication; do not use this as a private/regulated meeting system without adding authentication, abuse controls and TURN credentials management.
- No system can be truthfully certified “5/5” from source review alone. Run the test suite and real Android/browser/network checks before production release.


## v20.5 — TURBO low-latency profile

- Thêm profile TURBO mặc định: camera mục tiêu 480×270/60 fps, tắt hiệu ứng vẽ tốn GPU và giữ skeleton/nhận diện cử chỉ.
- Giảm ảnh đầu vào suy luận từ 480×270 xuống 384×216 để giảm thời gian tạo bitmap/chuyển dữ liệu; độ chính xác có thể giảm khi bàn tay ở xa.
- Giảm ngưỡng loại kết quả quá cũ từ 250 ms xuống 100 ms; khung chậm bị bỏ thay vì làm tay bám theo quá khứ.
- Đây là tối ưu theo độ trễ, không bảo đảm 1–10 ms đầu-cuối; camera, inference, vsync và phần cứng vẫn chi phối.

## v20.4 — WonderSnap cử chỉ nâng cao, HUD viễn tưởng và tiếng Việt

- **Xoay/thu phóng bằng hai tay:** khoảng cách giữa hai bàn tay điều chỉnh tỷ lệ mô hình từ 0,35× đến 3,2×; xoay đường nối giữa hai lòng bàn tay để xoay mô hình và nâng/hạ cả hai tay để nghiêng góc nhìn.
- **Gắp linh kiện trực tiếp:** chụm ngón cái + ngón trỏ gần một điểm linh kiện để chọn và tách; trong lúc giữ chụm, rê tay để kéo linh kiện theo hướng tay; thả tay để giữ vị trí, chụm lại để lắp về.
- **Xoay cổ tay nhạy hơn:** tăng độ phản hồi có giới hạn, vẫn giữ làm mượt và không chạy thêm mạng phân loại.
- **Xung lực lòng bàn tay:** xòe bàn tay và vuốt/đẩy nhanh để kích hoạt một xung lực hạt sáng cùng vòng HUD năng lượng. **Khiên hologram:** giơ ngón cái ở cả hai tay và giữ khoảng 0,55 giây để bật các vòng bảo vệ quanh mô hình. Đây là các hành động hình học chạy cục bộ, không phải nhận diện ý định bằng AI.
- **Thiết kế bàn tay hologram:** lưới tam giác lòng bàn tay, vòng định vị quanh khớp, cổ tay phát sáng và tâm ngắm phân đoạn thay cho dấu chấm phẳng. Ba hình concept nằm trong `docs/designs/`.
- **Việt hóa WonderSnap:** giao diện, hướng dẫn cử chỉ, trạng thái, tên danh mục/mô hình phổ biến, tên bộ phận, phần lớn mô tả phổ biến, lệnh giọng nói và trạng thái tư thế ngón cái; giọng đọc yêu cầu `vi-VN` trong trình duyệt hỗ trợ.
- Giữ nguyên commit WonderSnap đã ghim `cf2dcb1f27313175f9b7482bf427f76240452c23`, camera upstream 1280×720@30 và các mặc định hạt/DPR để tránh giảm chất lượng không có số đo thiết bị thật.

### Ảnh concept

- `docs/designs/design-01-ban-tay-hologram.png` — lưới tay hologram và mạch năng lượng.
- `docs/designs/design-02-chon-tach-linh-kien.png` — vòng khóa mục tiêu, tách từng bộ phận.
- `docs/designs/design-03-gauntlet-vi-dieu-khien.png` — giao diện điều khiển không gian và vòng năng lượng.

### Giới hạn xác minh

Các test cục bộ xác nhận code patch được áp dụng lên fixture và vẫn hợp cú pháp. Mã WonderSnap thật cùng model bàn tay được tải lúc build Render; ZIP này không nhúng bản upstream 7,8 MB. Cần build có mạng và thử camera/đồ họa trên Android thật để xác nhận luồng tương tác và độ trễ đầu-cuối. Không có cam kết 1–10 ms cho toàn đường camera → nhận diện → vẽ.

## v20.3 — Đồng bộ nguồn WonderSnap và triển khai có thể tái lập

- Ghim mã WonderSnap theo commit `cf2dcb1f27313175f9b7482bf427f76240452c23` thay vì theo dõi nhánh `main` trôi nổi. Có thể đặt `WONDERSNAP_COMMIT` bằng SHA đủ 40 ký tự.
- Xác minh SHA trước khi đóng gói; kiểm tra tính năng Standard / More forgiving và buffer của các mô hình procedural.
- Dùng `npm ci` trong thư mục phụ thuộc riêng để không trộn MediaPipe của WonderSnap với Skeleton.

Nguồn upstream được tải khi Render build do model bàn tay khoảng 7,8 MB không được nhân đôi trong ZIP. Xem `docs/V20_3_WONDERSNAP_SYNC.md`.

## v20.2 — Random matching, in-call gestures and network telemetry

- The meeting lobby now supports an explicit random-match button. Matchmaking is ephemeral, one-to-one, and expires after 120 seconds; cancel/hang up removes the waiting entry. Do not enable random video matching without a clear user consent prompt.
- The active call's local camera stream is reused by Skeleton's existing inference pipeline, avoiding a second camera capture. Gesture effects render above the meeting overlay; hangup stops the shared stream and closing the meeting can restore the normal Skeleton camera.
- WebRTC polling is faster during connection setup, with a bounded server rate limit. Media is still peer-to-peer; signaling poll speed does not equal audio/video latency.
- Network diagnostics display selected ICE candidate type, estimated RTT, audio jitter/loss and received video bitrate. Video sender is capped around 1.5 Mbps and prefers maintaining frame rate.
- Random match requires one server process because the ephemeral queue is in memory. For multiple Render instances, move matchmaking and signaling to Redis/WebSocket or a shared service. TURN remains recommended for restrictive NAT/mobile carrier networks.
- Full camera-to-screen 1–10 ms is not a realistic universal guarantee. The project reports the geometry decision time separately from inference, frame age, render and WebRTC network statistics.

## v20.5 — TURBO ưu tiên độ trễ

Bản này đặt `TURBO` làm profile mặc định: camera mục tiêu 480×270/60 FPS, ảnh suy luận 384×216, tắt hiệu ứng vẽ phụ và bỏ kết quả có tuổi trên 100 ms. Chuyển profile bằng phím `P`. Đây là cấu hình đánh đổi một phần chất lượng nhận diện lấy phản hồi nhanh hơn; nếu tay nhỏ/xa hoặc thiếu sáng, chuyển sang ULTRA/BALANCED.

Kết quả kiểm tra cục bộ: 80/80 test, 9/9 E2E mô phỏng. Benchmark bộ phân loại không phải benchmark motion-to-photon. Đọc `docs/V20_5_LOW_LATENCY.md` để đo trên Android/desktop và các giới hạn vật lý.
