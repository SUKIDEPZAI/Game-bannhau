# AI Hand & Head Skeleton — gói tất cả trong một

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
Phím: `P` profile (ULTRA/BALANCED/QUALITY) · `T` bật/tắt telemetry · `V` phong cách · `H` tay · `E` đầu · `S` chụp · `C` camera · `F` fullscreen.
Phân tích chi tiết: `LATENCY_ANALYSIS.md`.


## v13 — nâng cấp tracking / độ trễ / cử chỉ
Chi tiết, bằng chứng và hạn chế: `docs/UPGRADE_V13.md` · số liệu benchmark: `docs/bench-output.txt`.
- `npm test` (16 test) · `npm run e2e` (chạy nguyên main.js với trình duyệt giả, 6 kịch bản lỗi) · `npm run bench` (A/B v12 vs v13) · `npm run sweep` (Pareto tham số lọc). Không cần cài thêm gì.
- Phím mới: `R` ghi/dừng replay (tải file `.jsonl` landmark thô + timestamp). `T` hiện telemetry P50/P95/P99/MAX.
- Mọi hằng số quan trọng nằm trong `public/js/config.js` (có chú thích).


## v14 — skeleton xương + chạm nút bằng đầu ngón tay
- **Bỏ skeleton đầu/mặt** (không còn nạp model face → nhẹ hơn, hand luôn được ưu tiên).
- **Skeleton mới "XƯƠNG"** (mặc định): xương bàn tay (cổ tay→gốc ngón) + đốt ngón, khớp tròn nhỏ dần về đầu ngón, mô lòng bàn tay; **mỗi đầu ngón là một vòng tròn màu**. Các kiểu NEON/WIRE/HOLO vẫn còn (nút 🎨 / phím `V`).
- **Chạm nút bằng đầu ngón** (nút 👆 / phím `I` để bật/tắt): rê vòng tròn đầu ngón lên nút → nút sáng; **chỉ tay giữ yên ~0.7 s** → bấm (có vòng tiến trình); **chụm ngón cái + trỏ** → bấm ngay. Bàn tay xòe 5 ngón chỉ hover (chống bấm nhầm). Chỉnh trong `config.js` → `INTERACT`.
- `npm test` (23 test) · `npm run e2e` (7 kịch bản) · `npm run preview` (xuất ảnh xem trước skeleton, cần python3 + Pillow).
