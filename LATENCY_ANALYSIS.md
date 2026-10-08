# Phân tích độ trễ skeleton — kế hoạch kỹ thuật

Nhãn: **[FACT]** = có trong tài liệu/issue/code; **[INFER]** = suy luận/ước lượng, phải đo lại bằng telemetry (phím `T`).

## 1. Executive verdict
- Bản hiện tại (QUALITY, inference trên main thread): **~70–120 ms** motion-to-photon [INFER]. Bottleneck #1: `detectForVideo()` đồng bộ trên main thread chặn cả rVFC lẫn rAF → khung vẽ bị trễ/rơi.
- **1–10 ms khả thi ở từng tầng riêng lẻ** (filter ≈0.1 ms, render ULTRA ≈1–2 ms, hand inference ≈4–10 ms trên GPU tốt [INFER]).
- **End-to-end 1–10 ms KHÔNG khả thi** với webcam + màn hình thường: sensor/exposure/USB/driver thường 20–60 ms [INFER] + chờ vsync (60 Hz: 0–16.7 ms) [FACT: chu kỳ 16.67 ms]. Kể cả AI = 0 ms vẫn >10 ms.
- Cái làm được: skeleton **bám sát khung video đang hiển thị** (video cũng đã trễ), nên *cảm giác* dính tay. Đừng dự đoán tới "tay thật" — skeleton sẽ chạy trước video.

## 2. Bottleneck ranking (theo tác động latency)
1. Inference đồng bộ trên main thread (hand + face) → chặn rAF/UI. *(sửa: worker)*
2. Camera/capture + driver + 30 fps vs 60 fps: mỗi khung 30 fps = 33 ms tuổi trung bình thêm ~8 ms so với 60 fps [INFER]. *(sửa: 60 fps, kiểm tra getSettings)*
3. Display/vsync: 60 Hz cộng trung bình ~8 ms chờ [INFER]. Không sửa được bằng code.
4. **Dự đoán đếm đôi (lỗi code cũ):** `push(lm, now)` với `now` = lúc *bắt đầu* AI → `age` đã gồm thời gian AI, nhưng `lead` lại cộng `infer + camLag` → skeleton đi trước video. *(sửa: lead = 0 ở chế độ "video")*
5. Face mỗi 2–3 khung trên cùng luồng → khung chậm xen kẽ (jitter). *(sửa: face 4 khung/lần, ULTRA tắt hẳn)*
6. Renderer QUALITY: glow 3 lớp × 6 nhóm ngón, trail (50 đoạn), tessellation ~2500 đoạn, `new Path2D` mỗi frame, `measureText/roundRect` mỗi frame [INFER: ~3–8 ms].
7. Filter One Euro: ≈0.1 ms CPU; *độ trễ pha* phụ thuộc cutoff (xem mục E).
8. `assignHands` tham lam theo thứ tự → hoán đổi trái/phải khi hai tay giao nhau (không phải latency nhưng gây "giật").

## 3. Pipeline hiện tại
```
Camera sensor+USB+driver      20–60 ms [INFER]
 ↓ <video> decode
rVFC callback (main)           ~0–1
 ↓ detectForVideo(hand) SYNC   5–15  ┐ chặn main thread,
 ↓ detectForVideo(face) SYNC   8–20  ┘ face cách 2–3 khung
 ↓ assignHands + One Euro      <0.5
 ↓ chờ rAF (bị chặn)           0–25
 ↓ Canvas2D (QUALITY)          3–8
 ↓ compositor + vsync(60Hz)    8–25
Màn hình                       TỔNG ≈ 70–120 ms
```

## 4. Pipeline mục tiêu (đã code trong v12)
```
Camera → rVFC (không xếp hàng)
 ↓ latest-frame-wins: AI bận ⇒ BỎ khung (DROPPED++)
 ↓ createImageBitmap(video) → postMessage(transfer)
[Classic Worker] HandLandmarker (mỗi khung) + FaceLandmarker (mỗi N khung)
 ↓ Float32Array (transfer, ~1.5 KB tay / 5.7 KB mặt)
Main: assign 2×2 → One Euro → dự đoán có kẹp (≤50 ms) 
 ↓ rAF (luôn rảnh vì main không còn chạy AI)
Canvas2D (profile) → compositor → màn hình
```

## 5. Code đã thay đổi (xem file)
- `js/inference.worker.js` **mới** — classic worker, `importScripts(vision_bundle.cjs)`.
- `js/inference.js` **mới** — `InferenceClient` (1 khung đang xử lý), `MainThreadAI` (fallback), `pickSources`.
- `js/main.js` — viết lại: profile, telemetry, assign 2×2 tối ưu, rVFC→submit.
- `js/smoothing.js` — `pushPacked`, kẹp vận tốc, kẹp tầm nhìn 50 ms, giảm dự đoán khi đứng yên/đảo chiều.
- `js/renderer.js` — cờ `fx` (glow/trail/text/lasers).
- `server.js` — MIME JS cho `.cjs`.
- Không tạo `render.worker.js` — lý do ở mục J.

## 6. Ba profile
| | ULTRA_LOW_LATENCY | BALANCED | QUALITY |
|---|---|---|---|
| Camera | 640×360 @60 | 960×540 @60 | 1280×720 @30 |
| Face | tắt (không tạo model) | mỗi 4 khung | mỗi 2 khung |
| Style | WIRE (không glow) | NEON | NEON |
| glow/trail/text/lasers | tắt/tắt/tắt/tắt | bật/tắt/bật/tắt | bật hết |
| Dự đoán | "video" | "video" | "video" |

Đổi bằng phím `P`.

## 7. Benchmark protocol
1. Mở `T`, ghi `CAM, AI, XFER, RENDER, AGE, DROPPED, FPS` sau 30 s cho mỗi profile.
2. **Đo end-to-end thật:** quay bằng điện thoại 240 fps cả bàn tay thật và màn hình; đếm số khung giữa lúc tay bắt đầu di chuyển và lúc skeleton bắt đầu di chuyển (× 4.17 ms). Đây là cách duy nhất đo motion-to-photon thật; JS không đo được.
3. Lặp trên: desktop CPU-only (ép `delegate: CPU`), desktop GPU, laptop (cắm điện/pin), điện thoại (Chrome Android). Ghi `getSettings()` camera.
4. So sánh bật/tắt worker (fallback `MAIN` khi worker lỗi) cùng profile.

## 8. Expected result — **ước lượng, không đảm bảo**
| | AI | Render | Est. total | FPS hiển thị |
|---|---|---|---|---|
| Hiện tại (QUALITY, main thread) | 12–30 (chặn) | 3–8 | 70–120 | 30–55 |
| ULTRA + Worker + Canvas2D | 4–10 | 0.5–1.5 | 45–70 | ~60 |
| BALANCED + Worker | 5–12 | 1.5–3 | 50–75 | 55–60 |
| WebGL (chỉ QUALITY) | như trên | 0.3–1 | −2 đến −5 ms so với Canvas | ổn định hơn |

Mô phỏng nội bộ (bàn tay giả, nhiễu ±1.5‰): sai lệch so với khung hiển thị ≈6 ms (đều), ≈4 ms (đảo chiều), so với 7.4 ms khi không dự đoán — dự đoán chỉ cải thiện khiêm tốn; lợi ích chính là hết chặn main thread.

## 9. Critical caveats
- **Camera [FACT: rVFC]:** `captureTime` chỉ có với nguồn local và không phải trình duyệt nào cũng điền; `expectedDisplayTime` là *dự kiến*. HUD ghi rõ [đo]/[ước lượng].
- `getUserMedia` `ideal` không bảo đảm; thiếu sáng thường tự hạ về 30 fps (exposure dài) [INFER]. Luôn xem `getSettings()`.
- **MediaPipe [FACT]:** module worker lỗi `importScripts` (google-ai-edge/mediapipe#5257) → dùng classic worker; iOS từng không dùng OffscreenCanvas trong worker (#5292, v0.10.12) → có fallback `MainThreadAI`. Một bản patch được ghi trong release notes mới hơn nhưng chưa kiểm chứng ở đây.
- `detectForVideo` trong worker vẫn tranh GPU với compositor; 6 ms inference + 4 ms render **không** bằng 10 ms cố định — hàng đợi GPU có thể tuần tự hóa hoặc chồng lấp tuỳ driver [INFER].
- `desynchronized: true` chỉ là gợi ý; không phải nền tảng nào cũng hỗ trợ.
- Không dùng `SharedArrayBuffer`: cần COOP/COEP (cross-origin isolation), GitHub Pages không đặt được header và CDN/Google Storage sẽ bị chặn nếu thiếu CORP. Dữ liệu chỉ ~7 KB/khung nên transfer `ArrayBuffer` đã đủ rẻ [INFER].
- Mô hình tay/mặt nhận ảnh đã resize nhỏ (model-card ≈192–256 px [INFER]); giảm độ phân giải giúp chủ yếu ở bước upload/convert, không giảm tuyến tính chi phí mạng nơ-ron.

## 10. Final recommendation — nếu là project của tôi
1. **`inference.worker.js` + `inference.js` + `main.js`** (gộp làm một bước): chuyển AI khỏi main thread + latest-frame-wins. Tác động lớn nhất; fallback main thread đã có.
2. **`smoothing.js`**: bỏ đếm đôi lead, kẹp tầm nhìn 50 ms. Sửa lỗi "ngón đi trước".
3. **Camera**: dùng 640×360@60 làm mặc định cho ULTRA; luôn đọc `getSettings()`.
4. **`renderer.js` fx + profile**: tắt glow/trail/text khi cần.
5. **Face**: coi là tác vụ phụ (≤15 fps, nội suy ở 60 Hz — đã có).
6. Chạy benchmark 240 fps (mục 7) *trước khi* cân nhắc **WebGL**: workload hai tay (~50 đoạn) Canvas2D đã rẻ; WebGL chỉ đáng với face mesh + glow ở QUALITY.

### Phụ lục — chọn thông số filter [INFER, chỉnh theo telemetry]
Trễ pha ≈ 1/(2π·fc), fc = minCutoff + β·|v|. Tay đứng yên (minCutoff 2.2 Hz) ≈ 72 ms nhưng sai số = v×trễ rất nhỏ; khi nhanh (β=60, v=0.5/s → fc≈32 Hz) ≈ 5 ms.
| Đối tượng | minCutoff | β | ghi chú |
|---|---|---|---|
| Cổ tay | 1.5 | 50 | chậm, ổn định |
| Đầu ngón | 2.5 | 100 | cần bám nhanh |
| Ngón di chuyển nhẹ | 1.8 | 40 | ưu tiên hết rung |
| Mặt | 1.6 | 30 | thứ yếu |
So sánh: *không lọc* = 0 trễ + rung; *EMA* = trễ cố định; *Kalman* = tốt khi mô hình nhiễu đúng, tốn tinh chỉnh; *velocity prediction* = bù trễ nhưng khuếch đại nhiễu → cần kẹp/ramp; **One Euro + prediction có kẹp** là lựa chọn thực tế nhất.
