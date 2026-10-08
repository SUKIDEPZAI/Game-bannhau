# AI Hand & Head Skeleton v5

Chỉ vẽ skeleton **bàn tay (21 điểm/tay, 2 tay)** và **đầu (478 điểm, vẽ đường viền)**; chạy 100% trên trình duyệt.

```
index.html · css/style.css
js/main.js       vòng lặp (AI theo khung camera, vẽ theo tần số màn hình)
js/engine.js     HandLandmarker + FaceLandmarker, GPU→CPU
js/smoothing.js  One Euro filter + nội suy mũ 2 tầng
js/gesture.js    Mở bàn tay / Nắm đấm / Like / Chỉ tay / Chữ V / OK / Pinch
js/renderer.js   neon theo từng ngón, khung ngắm đầu
```

## Mượt hơn
- Làm mượt 2 tầng: One Euro (chống rung) + nội suy ở 60Hz+ (trượt đều dù AI ~30Hz)
- Gán tay vào 2 slot cố định theo vị trí cổ tay → bộ lọc không đổi chỗ khi hai tay gần nhau
- Fade vào/ra khi mất/thấy lại; đầu chạy xen kẽ frame để giảm tải
- Không shadowBlur; mỗi ngón 1 Path2D; độ dày nét tỉ lệ kích thước bàn tay

Phím: `H` tay · `E` đầu · `S` chụp ảnh · `C` đổi camera · `F` fullscreen.
Chạy qua HTTPS hoặc `python3 -m http.server` (localhost).
