# Nâng cấp v13 — báo cáo (root cause → sửa → đo)

> Phạm vi trung thực: **mọi số liệu dưới đây là từ mô phỏng xác định (Node, `npm run bench`)**, KHÔNG phải đo trên camera/GPU thật. Chưa chạy được trong trình duyệt (môi trường build không có mạng/camera/MediaPipe). Cần xác nhận lại bằng telemetry (phím `T`) trên máy của bạn. Không claim motion-to-photon.

## 1. Architecture audit (v12)
`rVFC → [bận? bỏ khung] → createImageBitmap → Worker(hand+face tuần tự) → Float32Array → assign → One Euro → rAF(step+predict) → Canvas2D`

## 2. Root cause
| # | BUG | NGUYÊN NHÂN (có trong code v12) | SỬA (v13) | BẰNG CỨNG (mô phỏng) |
|---|---|---|---|---|
| 1 | Trễ/kéo đuôi khi chuyển động | `smoothing.js`: đạo hàm lấy từ **output đã lọc** `(x−prev)/dt` ⇒ cutoff mở chậm (1€ chuẩn lấy từ tín hiệu **thô**) | đạo hàm từ tín hiệu thô, beta chuẩn hoá theo kích thước tay | sai lệch hiển thị rms 0.147→0.009 (60fps, const) |
| 2 | Overshoot khi dừng/đảo chiều | dự đoán theo từng toạ độ độc lập, `rev` giảm theo **số khung** không theo thời gian | vận tốc cấp bàn tay (palm anchor), detector đảo chiều/dừng đột ngột, feedback sai số dự đoán, gia tốc chuẩn hoá, suy giảm theo thời gian | overshoot khi dừng 0.33→0.005 (60fps) |
| 3 | Landmark nhảy 1 khung kéo cả ngón | không có outlier handling | residual chuẩn hoá theo hand-scale → giảm trọng số (soft/hard) | lệch tối đa đầu ngón 0.85→0.12 |
| 4 | Teleport khi tay trở lại | `reset()` ⇒ `d` bị gán thẳng vị trí mới | reacquire: `x` nhảy, `d` trượt có giới hạn, prediction ramp 0→1 trong 200 ms | bước nhảy lớn nhất 0.97→0.20 hand-size/lần vẽ |
| 5 | Hoán đổi/cướp danh tính tay | `assign`: tiền đoán cố định 50 ms, không aspect, không gating (slot trống 0.5 vẫn cướp track xa) | `tracking.js`: dự đoán theo thời gian thực trôi qua, chuẩn hoá hand-size, gating, xét mọi phép gán | test 2 tay giao nhau + thứ tự detection ngẫu nhiên: 0 swap |
| 6 | Hand bị trễ khi có face | worker gửi kết quả sau khi chạy **cả face** | gửi hand NGAY, face sau; face lập lịch theo thời gian (Hz), hạ trước | thiết kế (cần đo thật) |
| 7 | Chờ khung kế sau mỗi lần AI xong | chỉ gửi trong callback rVFC | `onIdle` → chụp ngay khung mới nhất (dedupe bằng `presentedFrames`) | thiết kế: tiết kiệm ≤ ½ chu kỳ camera (cần đo thật) |
| 8 | dt jitter | `dt` từ `performance.now()` lúc gửi | dùng `captureTime` của rVFC nếu có (kiểm tra hợp lệ), tách `ts` (đo) và `tAge` (trình chiếu) | — |
| 9 | Nhãn cử chỉ nhấp nháy | `gesture()` không nhớ trạng thái, ngưỡng cứng | hysteresis (ENTER≠EXIT), xác nhận theo ms (45/90/130 theo tốc độ), `""`=UNKNOWN, giữ nhãn khi chất lượng kém | test hysteresis: ≤1 lần đổi nhãn với nhiễu ngưỡng |
| 10 | Trail phụ thuộc Hz; cấp phát mỗi khung | `trail` đếm khung; `new Path2D`×(6+5), `TIPS.includes` | trail theo ms (ring buffer), vẽ thẳng trên ctx, lookup typed array | giảm allocation (chưa đo GC trong trình duyệt) |
| 11 | Telemetry chỉ EMA, gộp "XFER" | — | Metric P50/P95/P99/MAX; tách CAPTURE / main→worker / AI / worker→main / POST / RENDER / AGE (mốc epoch chung `timeOrigin+now`) | — |

## 3. Quyết định thuật toán
| Nguồn | Ý tưởng | Dùng? | Lý do |
|---|---|---|---|
| One Euro (Casiez 2012; reference impl.) | LPF cutoff theo tốc độ; đạo hàm từ tín hiệu thô | **Có (baseline)** | rẻ (~140 ns/lệnh), 2 tham số; sửa lệch chuẩn của v12 |
| MediaPipe LandmarksSmoothingCalculator | có no_filter / one_euro / velocity filter; chuẩn hoá theo kích thước đối tượng [INFER, chưa đọc source] | Ý tưởng (beta ÷ hand-scale) | scale-invariant |
| Alpha-Beta | | **Không** | overshoot lúc dừng 14.5e-3 vs 1.9e-3 |
| Kalman CV | | **Không (mặc định)** | CPU ~3× , jitter đứng yên cao hơn với tham số này (chưa tinh chỉnh kỹ — kết luận chỉ đúng cho bộ tham số đã thử) |
| Fingerpose / HandFlow | curl/hướng ngón, fuzzy | Ý tưởng (hysteresis+UNKNOWN) | giữ nhãn cũ, không thêm thư viện |
| Hungarian | | Không | tối đa 2×2 → brute-force đã tối ưu |
| Kalman CA / multi-hypothesis nặng / RANSAC / HMM / Random Forest / WebGL / Z-depth | | **Không triển khai** | chưa có bằng chứng lợi ích > chi phí; không có dữ liệu thật để huấn luyện/đánh giá |

Nguồn đã thực sự tra cứu: trang chính & mã tham chiếu 1€ filter, tài liệu MediaPipe calculators, đặc tả/MDN `requestVideoFrameCallback` (có `captureTime`, `expectedDisplayTime`, `presentedFrames`; `captureTime` chỉ có ở một số nguồn). **Chưa đọc code** các repo GitHub còn lại trong prompt (GestureOS, HandSense, Air_Canvas, …) — không claim đã nghiên cứu.

## 4. Kết quả benchmark (`docs/bench-output.txt`)
Đơn vị = số lần kích thước bàn tay, camera trễ 40 ms, AI 8 ms, render 60 Hz.
- Lỗi rms (60 fps): const 0.147→0.009 · sine 0.262→0.020 · dừng 0.097→0.010 · đảo chiều nhanh 0.384→0.037.
- 30 fps: const 0.147→0.038 · 120 fps: 0.119→0.034. Màn 144 Hz: sine 0.212→0.058.
- **Đánh đổi:** rung khi đứng yên tăng nhẹ (rms 0.002→0.003, tip 0.007→0.010 hand-size ≈ 0.0005 đơn vị chuẩn hoá) do đạo hàm thô để cutoff mở nhiều hơn một chút. Muốn êm hơn: hạ `FILTER.hand.beta` hoặc `minCutoff`.
- Ở 120 fps lỗi dự đoán cao hơn 60 fps (0.034 vs 0.009): chưa tối ưu, cần dữ liệu thật.

## 5. Test (`npm test`, 16 pass)
URL Render · nhãn cử chỉ cũ giữ nguyên · hysteresis · xác nhận theo ms · giữ nhãn khi chất lượng kém · swipe (24–120 fps, không nhận nhầm trôi chậm/lắc, cooldown) · 2 tay giao nhau · gating · failure injection (spike, mất khung, NaN) · FPS 24–120 · reacquire · jitter đứng yên · replay xác định · PerfController (không dao động) · percentile.

## 6. Thay đổi hành vi (OLD → NEW → WHY → TRADE-OFF)
- Face: mỗi N khung → theo Hz (12/24) và hạ trước khi hạ tay. Trade-off: face có thể thưa hơn khi tải cao.
- Nhãn cử chỉ đổi sau 45–130 ms (trước: tức thì). Trade-off: trễ nhãn nhỏ đổi lấy hết nhấp nháy.
- Hiệu năng tự hạ: face ½ → tắt face → tắt FX nặng (chỉ khi P95 vượt ngân sách ≥1.5 s; phục hồi sau ≥6 s).
- Phím `R` (replay), `T` hiển thị percentile. Giao diện/phím cũ giữ nguyên.

## 7. Hạn chế còn lại / việc cần làm trên máy thật
1. Chưa chạy trong trình duyệt: cần thử `ULTRA/BALANCED/QUALITY` và đọc telemetry `T`.
2. Chưa benchmark ImageBitmap vs VideoFrame vs OffscreenCanvas (giữ ImageBitmap — tương thích rộng). Có sẵn mốc CAPTURE/XFER để so sánh.
3. Cử chỉ vẫn 2D (chưa dùng Z, chưa có hệ toạ độ cục bộ/finger-state UNKNOWN đầy đủ, chưa có điểm fuzzy 0..1): chưa có dữ liệu thật để chứng minh lợi ích.
4. Chưa có landmark-level confidence/bone-consistency, track state machine đầy đủ (hiện: gating + reacquire ramp + ẩn sau `lostHideMiss`), multi-hypothesis.
5. Face renderer vẫn tạo Path2D (contour/tessellation) mỗi khung; chưa chuyển WebGL (chưa có bằng chứng bottleneck).
6. Không thể đạt/claim 1–10 ms end-to-end: phụ thuộc sensor, driver, vsync, màn hình. Đo thật bằng camera 240 fps (xem `LATENCY_ANALYSIS.md` §7).
