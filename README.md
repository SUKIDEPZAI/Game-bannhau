# AI Hand & Head Skeleton — bản chạy trên Render

Cấu trúc repo GitHub (không cần làm gì thêm):
```
server.js  package.json  render.yaml
public/    ← index.html, css/, js/ (app)
```

## Deploy lên Render (Free)
1. Push cả thư mục này lên GitHub.
2. Render → **New → Blueprint** (đọc `render.yaml`) hoặc **New → Web Service**: Build `npm install`, Start `node server.js`, Plan **Free**.
3. Mở URL `https://<tên>.onrender.com` (HTTPS nên camera hoạt động).

## Server làm gì
- Phục vụ WASM + thư viện MediaPipe từ chính domain (`/vendor`), model `.task` cache trên server (`/models`) → tải nhanh, nén Brotli/gzip, cache 1 năm.
- `/healthz` để Render kiểm tra sống.
- **Keep-alive:** mỗi 60 giây server tự gọi `RENDER_EXTERNAL_URL/healthz` (đổi bằng `KEEPALIVE_MS`, hoặc đặt `KEEPALIVE_URL` nếu dùng domain riêng).

## Lưu ý
- AI chạy ngay trên máy người dùng (không gửi video lên Render) nên độ trễ skeleton do thiết bị quyết định; server chỉ giúp tải/khởi động nhanh hơn.
- Tự ping không đánh thức được service đang ngủ. Nên thêm 1 dịch vụ ngoài (UptimeRobot/cron-job.org) gọi `/healthz` mỗi 5 phút làm dự phòng.
- Free plan có 750 giờ/tháng — đủ cho 1 service chạy 24/7.
