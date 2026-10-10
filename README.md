# AI Hand Skeleton — gói tất cả trong một

```
server.js  package.json  render.yaml   ← Render (Free Web Service)
public/                                  ← giao diện (index.html, css/, js/)
```

## Cách 1 — chạy hết trên Render
Push repo → Render → New → Blueprint (đọc `render.yaml`, plan Free) → mở `https://<tên>.onrender.com`. Không cần cấu hình thêm.

## Cách 2 — giao diện trên GitHub Pages, Render làm backend
1. Deploy repo lên Render như trên, copy URL.
2. Mở `public/js/config.js` — `MANUAL` đã được điền sẵn `https://game-bannhau.onrender.com` (đổi nếu service Render của bạn khác tên; nếu dùng Blueprint, sửa `name` trong `render.yaml` cho khớp để không tạo service thứ hai).
3. Đưa nội dung thư mục `public/` (kèm `.nojekyll`) lên GitHub Pages (Settings → Pages → `main` + `/ (root)`).
Render ngủ thì trang tự dùng CDN, không phải chờ.

## Server
`/ping` đo RTT · `/vendor` + `/models` (CORS, nén, cache 1 năm) · tự ping chính nó mỗi 60s (`KEEPALIVE_MS`) · `ALLOWED_ORIGIN` giới hạn domain.
Tự ping không đánh thức service đang ngủ → thêm UptimeRobot/cron-job.org gọi `/ping` mỗi 5 phút làm dự phòng.

## Bù trễ
Vị trí vẽ = vị trí lọc + vận tốc × (độ trễ camera đo thật từ `requestVideoFrameCallback` + thời gian AI + 1 frame).


## v12 — pipeline độ trễ thấp
Camera → rVFC (latest-frame-wins) → ImageBitmap → **classic Worker** (MediaPipe) → Float32Array → filter+predict → rAF → Canvas 2D.
Phím: `P` profile (ULTRA/BALANCED/QUALITY) · `T` bật/tắt telemetry · `V` phong cách · `H` tay · `I` bật/tắt chạm nút bằng đầu ngón · `R` ghi/dừng replay · `S` chụp · `C` camera · `F` fullscreen. v14 không còn chức năng theo dõi đầu/mặt nên phím `E` đã bị loại bỏ.
Phân tích chi tiết: `LATENCY_ANALYSIS.md`.


## v13 — nâng cấp tracking / độ trễ / cử chỉ
Chi tiết, bằng chứng và hạn chế: `docs/UPGRADE_V13.md` · số liệu benchmark: `docs/bench-output.txt`.
- `npm test` (16 test ở mốc v13) · `npm run e2e` (trình duyệt giả, 6 kịch bản ở mốc v13) · `npm run bench` (A/B v12 vs v13) · `npm run sweep` (Pareto tham số lọc). Không cần cài thêm gì.
- Phím mới: `R` ghi/dừng replay (tải file `.jsonl` landmark thô + timestamp). `T` hiện telemetry P50/P95/P99/MAX.
- Mọi hằng số quan trọng nằm trong `public/js/config.js` (có chú thích).


## v14 — skeleton xương + chạm nút bằng đầu ngón tay

Bản audit/fix bổ sung: bảo vệ vòng đời camera bằng generation token, fallback RAF khi thiếu `requestVideoFrameCallback`, timeout/khôi phục khi Worker lỗi lúc đang chạy, reset tracking/telemetry khi đổi camera, bỏ nạp FaceLandmarker không dùng trong fallback, sửa hotkey `E` cũ và đo AGE theo track cũ nhất. Xem `docs/UPGRADE_V14_AUDIT.md` để biết chi tiết và giới hạn kiểm chứng.
- Fallback main-thread chỉ tải HandLandmarker; không nạp FaceLandmarker khi Worker thất bại. Camera restart có generation guard, hủy callback cũ, fallback RAF khi thiếu `requestVideoFrameCallback`; AGE lấy track cũ nhất đang hiển thị.
- **Bỏ skeleton đầu/mặt** (không còn nạp model face → nhẹ hơn, hand luôn được ưu tiên).
- **Skeleton mới "XƯƠNG"** (mặc định): xương bàn tay (cổ tay→gốc ngón) + đốt ngón, khớp tròn nhỏ dần về đầu ngón, mô lòng bàn tay; **mỗi đầu ngón là một vòng tròn màu**. Các kiểu NEON/WIRE/HOLO vẫn còn (nút 🎨 / phím `V`).
- **Chạm nút bằng đầu ngón** (nút 👆 / phím `I` để bật/tắt): rê vòng tròn đầu ngón lên nút → nút sáng; **chỉ tay giữ yên ~0.7 s** → bấm (có vòng tiến trình); **chụm ngón cái + trỏ** → bấm ngay. Bàn tay xòe 5 ngón chỉ hover (chống bấm nhầm). Chỉnh trong `config.js` → `INTERACT`.
- `npm test` (28 test sau audit v14) · `npm run e2e` (9 kịch bản mô phỏng, gồm fallback khi không có rVFC và camera restart thất bại) · `npm run preview` (xuất ảnh xem trước skeleton, cần python3 + Pillow).


## v14 latency-focused patch (2026-10-10)
- Default profile now starts in `ULTRA` (640×360@60) instead of `BALANCED` (960×540@60), matching the latency-first goal. Users can still switch profiles.
- Inference input is resized to 480×270 before transfer to the Worker; preview/canvas stays at camera resolution. Since model landmarks are normalized, the mapping remains aligned when aspect ratio is preserved. If browser resize options are unsupported, the code falls back to the original bitmap. This trades some detection detail for lower inference cost and must be benchmarked on the target device.
- This is a latency optimization attempt, not proof of sub-100ms or 1–10ms motion-to-photon. Check AI P95, AGE P95, CAPTURE, XFER→W and W→MAIN on real hardware.

## v15 — Three local specialist agents

`public/js/ai-agents.js` adds three lightweight, local adaptive decision systems:

1. **Latency Agent** diagnoses whether measured P95 suggests inference, scheduling/age, rendering, or device bottlenecks and reports a next-step recommendation.
2. **Tracking Quality Agent** scores landmark validity and missed detections conservatively.
3. **Gesture Agent** classifies motion context (stable / normal / fast motion / cautious) for diagnostics.

These are deterministic specialist controllers, **not three additional neural-network models**. They do not issue extra MediaPipe inference calls and are designed to avoid adding meaningful work to the latency-critical path. Their outputs are shown in the HUD. The existing MediaPipe HandLandmarker remains the actual learned pose model; changing to a larger neural model without real-device measurements could make the 100–300 ms latency worse.
