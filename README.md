# Skeleton v18 — Low-Latency Performance Lab

Focus: realtime hand tracking on Android, frame freshness, smooth rendering, model A/B benchmarks, and non-blocking Render/PostgreSQL maintenance tasks.

## What's new in v18

- **15 specialist managers + 1 self-review manager (16 total):** camera/capture, model, scheduler, tracking, smoothing, identity, gesture, fingertip interaction, renderer, performance, telemetry, Render API, PostgreSQL, jobs, reliability, plus cross-agent contradiction review. These are cheap, deterministic rule-based supervisors—not 16 extra neural networks—and do not run inference in the camera-frame loop.
- **Adaptive smoothing:** bounded adjustment of One Euro `beta` according to movement speed and tracking score; changes ease toward a target rather than jump frame-to-frame.
- **Model A/B:** Model A is the existing MediaPipe GPU-first/CPU fallback. Model B is an experimental `@svenflow/micro-handpose@0.3.0` WebGPU module worker, loaded only when selected. It measures model inference P50/P95, capture-to-result age P95, detection rate, and sample count on the same camera/device. Benchmark warms each model for 1.8 s, measures each phase for 10 s, and restores MediaPipe even when stopped/cancelled. The experiment may fail due to WebGPU, CDN/CORS, memory or browser support; in that case MediaPipe stays/restores as fallback.
- **Latest-frame-wins stays:** at most one frame per model worker; stale inference results do not queue up. Render updates continue independently.
- **Backend safety:** PostgreSQL stores aggregate metrics and queued jobs only; no frames, camera images or landmarks are sent to the server. Uploading summary metrics is **off by default**; it requires the user to check a consent box and then sends a summary at most once per 60 seconds while tracking. `/api/status`, `/healthz`, `/version.json`; HTML uses `no-store` to reduce stale-deployment confusion.
- **Dedicated Render job worker:** jobs run in `jobs-worker.js`, not the web request process. `FOR UPDATE SKIP LOCKED`, bounded kinds/payloads, retries, and stale-running recovery.
- **API controls:** metrics ingestion rate limit, bounded JSON body and metric validation, admin-token guard for job management, security response headers.

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

Current local verification: 48/48 unit/contract tests pass; 9/9 simulated E2E scenarios pass; `npm run bench` and `npm run sweep` run deterministic simulations. The container had no `node_modules`, and `npm install --no-audit --no-fund` timed out, so a live Express/PostgreSQL smoke test was not run here. Node tests and simulated E2E can verify logic/contract regressions; they cannot establish camera motion-to-photon latency or validate WebGPU on your Android device. Model B is therefore visibly marked experimental until the on-device A/B report confirms both latency and detection rate.


## WonderSnap 3D mode (v19)

The Render web build vendors the MIT-licensed [WonderSnap project](https://github.com/AkbarSheikh-debug/wondersnap) and serves it at `/wondersnap/`. Use the WONDER link in the main screen. On Android, stop Skeleton tracking before starting WonderSnap to avoid two concurrent camera/GPU loops. See `docs/WONDERSNAP_INTEGRATION.md`.
