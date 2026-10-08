# Frontend — GitHub Pages
1. Mở `js/config.js`, đổi `RENDER_URL` thành URL Render của bạn (vd `https://skeleton-api.onrender.com`).
2. Upload toàn bộ thư mục (`index.html`, `css/`, `js/`, `.nojekyll`) vào gốc repo → Settings → Pages → `main` + `/ (root)`.
- Trang tự dùng thư viện + model từ Render nếu Render đang thức (nhanh, có cache); nếu Render ngủ thì dùng CDN ngay, không bị chờ.
- Ô **PING** trên HUD là thời gian phản hồi tới Render, cập nhật mỗi 60 giây (cũng giữ Render thức khi trang đang mở).
Phím: `V` phong cách · `H` tay · `E` đầu · `S` chụp · `C` camera · `F` fullscreen.
