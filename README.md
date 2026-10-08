# AI Pose Tracking — Skeleton v4 Pro

Camera AI nhận diện khung xương, chạy 100% trên trình duyệt (MediaPipe), sẵn sàng cho GitHub Pages.

## Cấu trúc (theo mô hình module của FormFlow / FormAI / FormCheck)
```
index.html
css/style.css
js/main.js          vòng lặp, camera, phím tắt
js/poseEngine.js    tải MediaPipe, GPU→CPU, Lite/Full
js/smoothing.js     One Euro filter cho 33 landmark
js/tracker.js       ID ổn định nhiều người
js/analyzer.js      góc khớp, nhận diện động tác, đếm rep
js/repCounter.js    phase state machine có hysteresis
js/formChecker.js   luật phản hồi form
js/renderer.js      vẽ neon (Path2D gộp, không shadowBlur)
js/ui.js            HUD, cập nhật DOM tối thiểu
js/angleUtils.js    hình học + chỉ số landmark
```

## Tối ưu độ mượt
- `requestVideoFrameCallback`: suy luận đúng lúc có khung hình mới, không poll
- Bỏ `shadowBlur`; glow là 3 lớp nét mờ, mỗi lớp 1 `Path2D` cho cả bộ xương
- Tái sử dụng object landmark (không tạo rác mỗi frame), thẻ HUD chỉ cập nhật 4 lần/giây
- Tạm dừng khi tab bị ẩn; canvas `desynchronized`

## Phím tắt
`F` fullscreen · `C` đổi camera · `S` chụp ảnh · `R` reset rep · `M` đổi model Lite/Full

## Chạy
Cần HTTPS hoặc localhost (ES modules + camera). Cục bộ: `python3 -m http.server` rồi mở http://localhost:8000.
GitHub Pages: upload toàn bộ thư mục → Settings → Pages → `main` + `/ (root)`.
