// ===== CẤU HÌNH TRUNG TÂM (v13) =====
// 1) URL Render: đã nhập sẵn. Chạy trên chính domain Render/localhost thì tự dùng origin; còn lại (GitHub Pages, file://) dùng MANUAL.
const MANUAL = "https://game-bannhau.onrender.com";   // không có "/" ở cuối
const loc = globalThis.location, host = loc?.hostname || "";   // an toàn khi import ngoài trình duyệt (test Node)
export const RENDER_URL = loc && (host.endsWith("onrender.com") || host === "localhost" || host === "127.0.0.1") ? loc.origin : MANUAL;

// 2) Profile (v14: KHÔNG còn skeleton đầu → faceFps luôn 0; style 0 = XƯƠNG mới): cam [rộng, cao, fps] · faceFps = tần số face (0 = tắt) · fx = hiệu ứng vẽ · predict = "video" (bám khung đang hiển thị) | "world"
export const PROFILES = {
  ULTRA:    { cam: [640, 360, 60],  faceFps: 0,  style: 2, fx: { glow: false, trail: false, text: false, lasers: false }, predict: "video" },
  BALANCED: { cam: [960, 540, 60],  faceFps: 0,  style: 0, fx: { glow: true,  trail: false, text: true,  lasers: false }, predict: "video" },
  QUALITY:  { cam: [1280, 720, 30], faceFps: 0,  style: 0, fx: { glow: true,  trail: true,  text: true,  lasers: true  }, predict: "video" }
};

// 3) Bộ lọc/dự đoán (đơn vị: toạ độ chuẩn hoá 0..1, giây). Nguồn: One Euro (Casiez 2012) + benchmark test/bench.js
export const FILTER = {
  hand: { minCutoff: 1.6, beta: 40, dCutoff: 9, tau: 0.006 },   // chọn bằng test/sweep.js (Pareto): trội hơn 2.2/60/6 ở cả jitter lẫn lag. minCutoff↓ = êm hơn khi đứng yên; beta↑ = bớt trễ khi nhanh
  face: { minCutoff: 1.6, beta: 30, dCutoff: 5, tau: 0.012 },
  maxHorizon: 0.05,        // MAX_PREDICTION_HORIZON (s): không bao giờ dự đoán quá 50 ms
  gapMs: 250,              // khoảng trống > ngưỡng này = tái bắt (reacquire): bỏ vận tốc, sửa vị trí có giới hạn
  reacqRampMs: 200,        // thời gian dự đoán tăng dần từ 0 sau reacquire
  outlierSoft: 0.35,       // sai số đo / kích thước bàn tay: > ngưỡng này bắt đầu giảm trọng số (nghi outlier)
  outlierHard: 1.2         // > ngưỡng này: gần như bỏ đo (trọng số 0.08)
};

// 4) Theo dõi / định danh tay
export const TRACK = {
  lostHideMiss: 5,         // số kết quả AI liên tiếp không thấy → ẩn tay
  lostResetMs: 250,        // mất > ngưỡng này → reset track
  assignGate: 3.0,         // khoảng cách tối đa (đơn vị = kích thước bàn tay) để nhận 1 detection vào track cũ
  emptyCost: 2.5,          // chi phí gán vào slot trống (tay mới); xa hơn mức này → coi là tay mới thay vì cướp track
  minHandSize: 0.02
};

// 5) Cử chỉ: mọi thời gian bằng ms, có hysteresis (EXIT khác ENTER)
export const GESTURE = {
  extEnter: 1.15, extExit: 1.06,        // tỉ lệ |tip−wrist| / |pip−wrist| để coi là DUỖI / GẬP
  pinchEnter: 0.28, pinchExit: 0.38,    // khoảng cách ngón cái–trỏ / kích thước bàn tay
  confirmMs: 90, confirmFastMs: 45, confirmStillMs: 130, fastSpeed: 1.0, stillSpeed: 0.1,   // thời gian xác nhận theo tốc độ (hand-widths/s)
  swipe: { windowMs: 280, minDisp: 2.0, minPeak: 4.0, minStraight: 0.8, cooldownMs: 500 }
};

// 6) Lập lịch khung + telemetry + bộ điều khiển hiệu năng
export const SCHED = { staleMs: 250, useCaptureTime: true };     // bỏ kết quả có THỜI GIAN CHỜ (không tính thời gian AI) > staleMs; dùng captureTime của rVFC cho dt nếu có
export const PERF = { evalMs: 500, degradeAfterMs: 1500, recoverAfterMs: 6000, cooldownMs: 4000, aiP95Budget: 22, ageP95Budget: 100, warmupMs: 3000, renderP95Budget: 6 };

// 7) Tương tác đầu ngón tay ↔ nút trên màn hình (xem interact.js)
export const INTERACT = {
  enabled: true,
  selector: "button",          // phần tử có thể chạm
  dwellMs: 700,                // giữ yên đầu ngón (đang CHỈ TAY) để bấm
  maxSpeedPx: 450,             // tốc độ tối đa (px/s) để tính giờ giữ — quét nhanh qua nút thì không bấm
  cooldownMs: 900,             // chống bấm lặp trên cùng một nút
  slopPx: 10,                  // nới vùng chạm quanh nút
  pinchClick: true,            // chụm ngón cái + trỏ = bấm ngay
  dwellAllTips: false,         // true = cả bàn tay xòe cũng bấm được bằng giữ yên (dễ bấm nhầm)
  rescanMs: 400                // quét lại vị trí nút
};
