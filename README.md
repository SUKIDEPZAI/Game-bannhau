# AI Hand & Head Skeleton — gói tất cả trong một

```
server.js  package.json  render.yaml   ← Render (Free Web Service)
public/                                  ← giao diện (index.html, css/, js/)
```

## Cách 1 — chạy hết trên Render
Push repo → Render → New → Blueprint (đọc `render.yaml`, plan Free) → mở `https://<tên>.onrender.com`. Không cần cấu hình thêm.

## Cách 2 — giao diện trên GitHub Pages, Render làm backend
1. Deploy repo lên Render như trên, copy URL.
2. Mở `public/js/config.js`, dán URL vào `MANUAL`.
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
