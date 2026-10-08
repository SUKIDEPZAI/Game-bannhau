// Chạy trên Render: tự dùng chính domain đó. Chạy trên GitHub Pages: dán URL Render vào MANUAL (không có "/" cuối).
const MANUAL = "";
export const RENDER_URL = location.hostname.endsWith("onrender.com") ? location.origin : MANUAL;
