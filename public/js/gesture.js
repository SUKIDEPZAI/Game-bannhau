// Cử chỉ v13: đặc trưng hình học (không cấp phát) → trạng thái ngón có HYSTERESIS → nhãn thô → xác nhận theo MILLISECOND (nhanh khi tay nhanh,
// chậm khi tay đứng yên) → UNKNOWN ("") khi chưa chắc. Giữ nguyên bộ nhãn cũ. Swipe là cử chỉ động, tách riêng, dùng hồi quy theo timestamp.
import { GESTURE as G } from "./config.js";

export class GestureTracker {
  constructor() { this.ext = [-1, -1, -1, -1]; this.thumb = -1; this.pinch = false; this.raw = ""; this.label = ""; this.cand = ""; this.candT = 0; this.state = "IDLE"; this.conf = 0; this.trace = []; }
  reset() { this.ext.fill(-1); this.thumb = -1; this.pinch = false; this.label = this.raw = this.cand = ""; this.state = "IDLE"; }
  // set: SmoothSet (21 điểm, x[]) · aspect: w/h · ts (ms) · speed: tốc độ palm (hand-widths/s) · ok: tay đủ tin cậy
  update(set, aspect, ts, speed = 0, ok = true) {
    const x = set.x, X = (i) => x[i * 2] * aspect, Y = (i) => x[i * 2 + 1];
    const d = (i, j) => Math.hypot(X(i) - X(j), Y(i) - Y(j)), size = d(0, 9) || 1;
    const E = [[8, 6], [12, 10], [16, 14], [20, 18]];
    for (let f = 0; f < 4; f++) {                                // tỉ lệ duỗi + hysteresis: giữa EXIT và ENTER → giữ trạng thái cũ (PARTIAL)
      const r = d(E[f][0], 0) / (d(E[f][1], 0) || 1), s = this.ext[f];
      this.ext[f] = r > G.extEnter ? 1 : r < G.extExit ? 0 : s < 0 ? (r > (G.extEnter + G.extExit) / 2 ? 1 : 0) : s;
    }
    const t1 = d(4, 17) > d(3, 17) * (this.thumb === 1 ? 1.02 : 1.08) && d(4, 5) > size * (this.thumb === 1 ? 0.38 : 0.45); this.thumb = t1 ? 1 : 0;
    const pr = d(4, 8) / size; this.pinch = this.pinch ? pr < G.pinchExit : pr < G.pinchEnter;
    const e = this.ext, n = e[0] + e[1] + e[2] + e[3], th = !!this.thumb;
    let l;
    if (this.pinch && (e[1] || e[2])) l = "Pinch";
    else if (n === 4) l = th ? "Mở bàn tay" : "4 ngón";
    else if (n === 0) l = th ? "Like" : "Nắm đấm";
    else if (n === 1 && e[0]) l = "Chỉ tay";
    else if (n === 2 && e[0] && e[1]) l = "Chữ V";
    else if (n === 3 && !e[0]) l = "OK";
    else l = `${n + (th ? 1 : 0)} ngón`;
    this.raw = l;
    if (!ok) return this.label;                                  // chất lượng kém → giữ nhãn cũ, không đổi
    if (l === this.label) { this.cand = ""; this.state = this.label ? "HELD" : "IDLE"; return this.label; }
    if (l !== this.cand) { this.cand = l; this.candT = ts; this.state = "CANDIDATE"; return this.label; }
    // thời gian xác nhận: nhanh khi tay nhanh (nhưng vẫn phải giữ đủ lâu), chậm hơn khi đứng yên (giảm nhãn giả)
    const need = speed > G.fastSpeed ? G.confirmFastMs : speed < G.stillSpeed ? G.confirmStillMs : G.confirmMs;
    if (ts - this.candT >= need) { if (this.trace.length < 16) this.trace.push([ts, this.label, l]); else { this.trace.shift(); this.trace.push([ts, this.label, l]); } this.label = l; this.cand = ""; this.state = "CONFIRMED"; }
    return this.label;
  }
}

// Swipe: lịch sử palm (vòng đệm) trong windowMs; cần quãng đường, vận tốc đỉnh, độ thẳng (net/path), có cooldown (edge-trigger).
export class SwipeDetector {
  constructor(N = 32) { this.t = new Float64Array(N); this.x = new Float32Array(N); this.y = new Float32Array(N); this.i = 0; this.n = 0; this.cool = 0; }
  reset() { this.n = 0; }
  // (x,y) = vị trí palm đã lọc; scale = kích thước bàn tay (cùng đơn vị). Trả về "L","R","U","D" hoặc "".
  push(ts, x, y, scale) {
    const N = this.t.length; this.t[this.i] = ts; this.x[this.i] = x; this.y[this.i] = y; this.i = (this.i + 1) % N; if (this.n < N) this.n++;
    if (ts < this.cool || this.n < 4) return "";
    const W = G.swipe; let k0 = -1, path = 0, peak = 0, px = 0, py = 0, pt = 0, first = true, fx = 0, fy = 0, lx = 0, ly = 0;
    for (let q = 0; q < this.n; q++) {                            // q=0 mới nhất
      const j = (this.i - 1 - q + N) % N; if (ts - this.t[j] > W.windowMs) break; k0 = q;
      if (first) { lx = this.x[j]; ly = this.y[j]; first = false; } else { const s = Math.hypot(px - this.x[j], py - this.y[j]); path += s; const dt = (pt - this.t[j]) / 1000; if (dt > 0) peak = Math.max(peak, s / dt); }
      px = this.x[j]; py = this.y[j]; pt = this.t[j]; fx = px; fy = py;
    }
    if (k0 < 3) return "";
    const dx = lx - fx, dy = ly - fy, disp = Math.hypot(dx, dy);
    if (disp / scale < W.minDisp || peak / scale < W.minPeak || disp / (path || 1) < W.minStraight) return "";
    this.cool = ts + W.cooldownMs; this.n = 0;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "R" : "L") : (dy > 0 ? "D" : "U");
  }
}
