// Fast, geometry-based hand pose classifier. Uses 21 landmarks only; no extra model or allocation in the hot path.
// Extension uses joint angle + finger length (normalized by palm width), with hysteresis and temporal confirmation.
import { GESTURE as G } from "./config.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function angleDeg(ax, ay, bx, by, cx, cy) {
  const ux = ax - bx, uy = ay - by, vx = cx - bx, vy = cy - by;
  const den = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  if (den < 1e-8) return 0;
  return Math.acos(clamp((ux * vx + uy * vy) / den, -1, 1)) * 57.29577951308232;
}

export class GestureTracker {
  constructor() {
    this.ext = [-1, -1, -1, -1]; this.thumb = -1; this.pinch = false;
    this.raw = ""; this.label = ""; this.cand = ""; this.candT = 0;
    this.state = "IDLE"; this.conf = 0; this.actionable = false; this.trace = [];
    this.fingerAngles = new Float32Array(4); this.fingerLengths = new Float32Array(4);
  }
  reset() {
    this.ext.fill(-1); this.thumb = -1; this.pinch = false; this.label = this.raw = this.cand = "";
    this.state = "IDLE"; this.conf = 0; this.actionable = false; this.candT = 0;
  }
  // set: SmoothSet (21 landmarks, x[]); aspect = video width/height; ts in ms;
  // speed = palm widths/sec; ok = tracker reports a stable/reacquired-enough sample.
  update(set, aspect, ts, speed = 0, ok = true) {
    const a = set.x, X = (i) => a[i * 2] * aspect, Y = (i) => a[i * 2 + 1];
    const d = (i, j) => Math.hypot(X(i) - X(j), Y(i) - Y(j));
    const palm = d(5, 17) || d(0, 9) || 1;
    const bases = [5, 9, 13, 17], pips = [6, 10, 14, 18], dips = [7, 11, 15, 19], tips = [8, 12, 16, 20];
    let n = 0, uncertain = false;
    for (let f = 0; f < 4; f++) {
      const angle = angleDeg(X(bases[f]), Y(bases[f]), X(pips[f]), Y(pips[f]), X(dips[f]), Y(dips[f]));
      const length = d(tips[f], bases[f]) / palm;
      this.fingerAngles[f] = angle; this.fingerLengths[f] = length;
      const was = this.ext[f];
      const enter = angle >= G.fingerAngleEnter && length >= G.fingerLengthEnter;
      const exit = angle <= G.fingerAngleExit || length <= G.fingerLengthExit;
      let next = was < 0 ? (enter ? 1 : 0) : enter ? 1 : exit ? 0 : was;
      // Don't turn a strongly bent but long/foreshortened finger into a confident extension.
      if (Math.abs(angle - G.fingerAngleEnter) < 7 && length > G.fingerLengthExit && length < G.fingerLengthEnter) uncertain = true;
      this.ext[f] = next; n += next;
    }
    const thumbAngle = angleDeg(X(2), Y(2), X(3), Y(3), X(4), Y(4));
    const thumbSpan = d(4, 5) / palm;
    const thumbWas = this.thumb;
    const thumbEnter = thumbAngle >= G.thumbAngleEnter && thumbSpan >= G.thumbSpanEnter;
    const thumbExit = thumbAngle <= G.thumbAngleExit || thumbSpan <= G.thumbSpanExit;
    this.thumb = thumbWas < 0 ? (thumbEnter ? 1 : 0) : thumbEnter ? 1 : thumbExit ? 0 : thumbWas;
    const pinchRatio = d(4, 8) / palm;
    this.pinch = this.pinch ? pinchRatio < G.pinchExit : pinchRatio < G.pinchEnter;

    const e = this.ext, th = this.thumb === 1;
    let label;
    // OK is explicitly a thumb-index contact PLUS the other three fingers open.
    // A plain pinch remains separate for fingertip clicking.
    if (this.pinch && e[0] === 0 && e[1] === 1 && e[2] === 1 && e[3] === 1) label = "OK";
    else if (this.pinch) label = "Pinch";
    else if (n === 4 && th) label = "Mở bàn tay";
    else if (n === 4) label = "4 ngón";
    else if (n === 0 && th) label = "Like";
    else if (n === 0) label = "Nắm đấm";
    else if (n === 1 && e[0] === 1) label = th ? "Súng" : "Chỉ tay";
    else if (n === 2 && e[0] === 1 && e[1] === 1) label = "Chữ V";
    else if (n === 3 && e[0] === 0) label = "3 ngón";
    else label = "Chưa rõ";
    this.raw = label;
    this.actionable = Boolean(ok && !uncertain);
    if (!this.actionable) { this.cand = ""; this.conf = 0; return this.label; }
    if (label === this.label) { this.cand = ""; this.state = this.label ? "HELD" : "IDLE"; this.conf = 1; return this.label; }
    if (label !== this.cand) { this.cand = label; this.candT = ts; this.state = "CANDIDATE"; this.conf = 0; return this.label; }
    const need = speed > G.fastSpeed ? G.confirmFastMs : speed < G.stillSpeed ? G.confirmStillMs : G.confirmMs;
    this.conf = clamp((ts - this.candT) / Math.max(1, need), 0, 1);
    if (ts - this.candT >= need) {
      if (this.trace.length >= 16) this.trace.shift();
      this.trace.push([ts, this.label, label]); this.label = label; this.cand = ""; this.state = "CONFIRMED"; this.conf = 1;
    }
    return this.label;
  }
}

// Swipe uses a fixed-size ring buffer (no unbounded allocation) and requires displacement, peak speed,
// and straightness, so casual hand tremor doesn't fire an action.
export class SwipeDetector {
  constructor(N = 32) { this.t = new Float64Array(N); this.x = new Float32Array(N); this.y = new Float32Array(N); this.i = 0; this.n = 0; this.cool = 0; }
  reset() { this.n = 0; this.i = 0; this.cool = 0; }
  push(ts, x, y, scale) {
    const N = this.t.length; this.t[this.i] = ts; this.x[this.i] = x; this.y[this.i] = y; this.i = (this.i + 1) % N; if (this.n < N) this.n++;
    if (ts < this.cool || this.n < 4) return "";
    const W = G.swipe; let k0 = -1, path = 0, peak = 0, px = 0, py = 0, pt = 0, first = true, fx = 0, fy = 0, lx = 0, ly = 0;
    for (let q = 0; q < this.n; q++) {
      const j = (this.i - 1 - q + N) % N; if (ts - this.t[j] > W.windowMs) break; k0 = q;
      if (first) { lx = this.x[j]; ly = this.y[j]; first = false; }
      else { const step = Math.hypot(px - this.x[j], py - this.y[j]); path += step; const dt = (pt - this.t[j]) / 1000; if (dt > 0) peak = Math.max(peak, step / dt); }
      px = this.x[j]; py = this.y[j]; pt = this.t[j]; fx = px; fy = py;
    }
    if (k0 < 3) return "";
    const dx = lx - fx, dy = ly - fy, disp = Math.hypot(dx, dy);
    if (disp / scale < W.minDisp || peak / scale < W.minPeak || disp / (path || 1) < W.minStraight) return "";
    this.cool = ts + W.cooldownMs; this.n = 0;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "R" : "L") : (dy > 0 ? "D" : "U");
  }
}

// Exposed for reproducible microbenchmarks; classification stays pure and dependency-free.
export const gestureMath = Object.freeze({ angleDeg });
