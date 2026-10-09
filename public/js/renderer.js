// 4 phong cách skeleton (NEON / BONE / WIRE / HOLO) cho tay + đầu. Không shadowBlur; mỗi nhóm 1 Path2D.
const FINGER = ["#ff4fa3", "#ffdc3a", "#00f5a0", "#45a3ff", "#b96cff", "#e8f4ff"];
const TIPS = [4, 8, 12, 16, 20], TIPK = (() => { const a = new Int8Array(21).fill(-1); [4, 8, 12, 16, 20].forEach((v, k) => a[v] = k); return a; })(), PALM = new Set([0, 5, 9, 13, 17]), HEAD = "#72f2ff", TAU = 6.2832;
export const STYLES = ["NEON", "BONE", "WIRE", "HOLO"];
const grp = (a, b) => PALM.has(a) && PALM.has(b) ? 5 : Math.floor((Math.max(a, b) - 1) / 4);

export class Renderer {
  mirrored = true; style = 0; fx = { glow: true, trail: true, text: true, lasers: true };
  constructor(canvas) { this.c = canvas; this.g = canvas.getContext("2d", { desynchronized: true }); }
  resize(w, h) { if (this.c.width !== w || this.c.height !== h) { this.c.width = w; this.c.height = h; } }
  clear() { this.g.clearRect(0, 0, this.c.width, this.c.height); }

  layers(path, col, w, al, glow = 1) {
    const g = this.g, st = path ? () => g.stroke(path) : () => g.stroke();   // path rỗng = stroke đường đang dựng trên ctx (không cấp phát Path2D)
    g.strokeStyle = col;
    if (glow && this.fx.glow) { g.globalAlpha = al * .14; g.lineWidth = w * 4.2; st(); g.globalAlpha = al * .4; g.lineWidth = w * 2; st(); }
    g.globalAlpha = al * .95; g.lineWidth = w * .75; g.strokeStyle = glow ? "#fff" : col; st();
  }

  capsule(x1, y1, x2, y2, r1, r2, col, al) {              // xương thon dần — ôm sát hình ngón tay
    const g = this.g, an = Math.atan2(y2 - y1, x2 - x1) + 1.5708, c = Math.cos(an), s = Math.sin(an);
    g.globalAlpha = al * .88; g.fillStyle = col; g.beginPath();
    g.moveTo(x1 + c * r1, y1 + s * r1); g.lineTo(x2 + c * r2, y2 + s * r2); g.lineTo(x2 - c * r2, y2 - s * r2); g.lineTo(x1 - c * r1, y1 - s * r1); g.closePath();
    g.moveTo(x1 + r1, y1); g.arc(x1, y1, r1, 0, TAU); g.moveTo(x2 + r2, y2); g.arc(x2, y2, r2, 0, TAU); g.fill();
    g.globalAlpha = al * .5; g.strokeStyle = "#fff"; g.lineWidth = Math.max(1, r2 * .5); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  }

  hand(s, conn, label, now = performance.now()) {
    if (this.fx.trail) this.trail(s, now); if (s.alpha < .02) return;
    const g = this.g, W = this.c.width, H = this.c.height, d = s.d, st = this.style, al = s.alpha;
    const px = (i) => d[i * 2] * W, py = (i) => d[i * 2 + 1] * H;
    const size = Math.hypot(px(0) - px(9), py(0) - py(9)), w = Math.max(2, size * .035);
    g.lineCap = g.lineJoin = "round";
    const rad = (i) => size * (i === 0 ? .1 : .075 - .011 * ((i - 1) % 4));

    if (st === 1) for (const { start: a, end: b } of conn) this.capsule(px(a), py(a), px(b), py(b), rad(a), rad(b), FINGER[grp(a, b)], al);
    else {
      if (st === 3) {                                       // HOLO: lòng bàn tay trong suốt + nét đứt
        g.globalAlpha = al * .14; g.fillStyle = HEAD; g.beginPath();
        [0, 1, 5, 9, 13, 17].forEach((i, k) => k ? g.lineTo(px(i), py(i)) : g.moveTo(px(i), py(i))); g.fill();
        g.setLineDash([size * .07, size * .05]);
      }
      for (let i = 0; i < 6; i++) {                           // mỗi nhóm ngón: dựng đường trực tiếp trên ctx rồi stroke nhiều lớp
        g.beginPath(); for (const { start: a, end: b } of conn) if (grp(a, b) === i) { g.moveTo(px(a), py(a)); g.lineTo(px(b), py(b)); }
        this.layers(null, FINGER[i], st === 2 ? Math.max(1.2, size * .016) : w, al, st === 2 ? 0 : 1);
      }
      g.setLineDash([]);
    }
    for (let i = 0; i < 21; i++) {                          // khớp: hình khác nhau theo phong cách
      const tip = TIPK[i] >= 0, x = px(i), y = py(i), col = tip ? FINGER[TIPK[i]] : "#fff";
      const r = st === 1 ? rad(i) * .5 : size * (tip ? .045 : .028);
      g.globalAlpha = al; g.fillStyle = col; g.strokeStyle = col; g.lineWidth = Math.max(1.2, size * .012);
      g.beginPath();
      if (st === 2) { g.moveTo(x, y - r * 1.3); g.lineTo(x + r * 1.3, y); g.lineTo(x, y + r * 1.3); g.lineTo(x - r * 1.3, y); g.closePath(); g.fill(); }
      else if (st === 3) { g.arc(x, y, r * 1.2, 0, TAU); tip ? g.fill() : g.stroke(); }
      else { g.arc(x, y, r, 0, TAU); g.fill(); if (tip || st === 1) { g.fillStyle = "#fff"; g.beginPath(); g.arc(x, y, r * .45, 0, TAU); g.fill(); } }
    }
    if (this.fx.trail) this.drawTrail(s, size, now);
    if (this.fx.text) this.tag(label, px(12), Math.min(py(8), py(12), py(16)) - size * .35, "#fff", al, size);
  }

  lasers(a, b) {                                            // tia sáng giữa đầu ngón hai tay (ý tưởng từ web-ar-hand-tracking)
    if (!this.fx.lasers) return;
    const al = Math.min(a.alpha, b.alpha); if (al < .05) return;
    const g = this.g, W = this.c.width, H = this.c.height; g.lineCap = "round";
    TIPS.forEach((i, k) => {
      g.beginPath(); g.moveTo(a.d[i * 2] * W, a.d[i * 2 + 1] * H); g.lineTo(b.d[i * 2] * W, b.d[i * 2 + 1] * H);
      this.layers(null, FINGER[k], Math.max(1.5, W / 520), al * .35);
    });
    g.globalAlpha = 1;
  }

  // Trail THEO THỜI GIAN (≤160 ms, mẫu mỗi ≥16 ms) → giống nhau ở 60/120/144 Hz; vòng đệm Float32Array, không cấp phát khi vẽ.
  trail(s, now) {
    const t = (s.tr ??= { t: new Float64Array(12), p: new Float32Array(12 * 10), i: 0, n: 0 });
    if (s.alpha > .3 && (t.n === 0 || now - t.t[(t.i + 11) % 12] >= 16)) { const o = t.i * 10; TIPS.forEach((v, k) => { t.p[o + k * 2] = s.d[v * 2]; t.p[o + k * 2 + 1] = s.d[v * 2 + 1]; }); t.t[t.i] = now; t.i = (t.i + 1) % 12; if (t.n < 12) t.n++; }
    else if (s.alpha <= .3 && t.n) t.n = Math.max(0, t.n - 1);
  }
  drawTrail(s, size, now) {
    const t = s.tr, g = this.g, W = this.c.width, H = this.c.height; if (!t || t.n < 2) return;
    g.lineCap = "round";
    for (let k = 0; k < 5; k++) for (let q = t.n - 1; q > 0; q--) {
      const j = (t.i - 1 - (t.n - 1 - q) + 24) % 12, j0 = (j + 11) % 12, age = now - t.t[j]; if (age > 160) continue;
      const f = 1 - age / 160; g.globalAlpha = f * f * .5 * s.alpha; g.strokeStyle = FINGER[k]; g.lineWidth = Math.max(1, size * .05 * f);
      g.beginPath(); g.moveTo(t.p[j0 * 10 + k * 2] * W, t.p[j0 * 10 + k * 2 + 1] * H); g.lineTo(t.p[j * 10 + k * 2] * W, t.p[j * 10 + k * 2 + 1] * H); g.stroke();
    }
    g.globalAlpha = 1;
  }

  head(s, eng) {
    if (s.alpha < .02) return;
    const g = this.g, W = this.c.width, H = this.c.height, d = s.d, st = this.style, al = s.alpha;
    const seg = (list, p = new Path2D()) => { for (const { start: a, end: b } of list) { p.moveTo(d[a * 2] * W, d[a * 2 + 1] * H); p.lineTo(d[b * 2] * W, d[b * 2 + 1] * H); } return p; };
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    for (let i = 0; i < 478; i++) { const x = d[i * 2], y = d[i * 2 + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const size = (y1 - y0) * H, w = Math.max(1.6, size * .008); g.lineCap = g.lineJoin = "round";
    const contour = seg(eng.faceConn);
    if (st === 1 && eng.faceOval) { g.globalAlpha = al * .12; g.fillStyle = HEAD; g.fill(seg(eng.faceOval)); }
    if (st === 2 && eng.faceMesh) { g.globalAlpha = al * .32; g.strokeStyle = HEAD; g.lineWidth = Math.max(.8, w * .45); g.stroke(seg(eng.faceMesh)); }
    if (st === 3) g.setLineDash([size * .02, size * .015]);
    this.layers(contour, HEAD, st === 1 ? w * 1.5 : w, al, st === 2 ? 0 : 1); g.setLineDash([]);
    const dots = new Path2D(), r = st === 3 ? w * .8 : w * 1.4;
    if (st === 3) for (let i = 0; i < 478; i += 2) { dots.moveTo(d[i * 2] * W + r, d[i * 2 + 1] * H); dots.arc(d[i * 2] * W, d[i * 2 + 1] * H, r, 0, TAU); }
    else { this._dots ??= [...new Set(eng.faceConn.map((c) => c.start))]; for (const a of this._dots) { dots.moveTo(d[a * 2] * W + r, d[a * 2 + 1] * H); dots.arc(d[a * 2] * W, d[a * 2 + 1] * H, r, 0, TAU); } }
    g.globalAlpha = al * .85; g.fillStyle = "#fff"; g.fill(dots);
    const m = size * .08, L = size * .12, X0 = x0 * W - m, Y0 = y0 * H - m, X1 = x1 * W + m, Y1 = y1 * H + m, br = new Path2D();
    for (const [x, y, sx, sy] of [[X0, Y0, 1, 1], [X1, Y0, -1, 1], [X0, Y1, 1, -1], [X1, Y1, -1, -1]]) { br.moveTo(x + sx * L, y); br.lineTo(x, y); br.lineTo(x, y + sy * L); }
    g.globalAlpha = al * .9; g.strokeStyle = HEAD; g.lineWidth = w * 1.6; g.stroke(br);
    if (this.fx.text) this.tag("HEAD", (X0 + X1) / 2, Y0 - size * .07, HEAD, al, size * .6); g.globalAlpha = 1;
  }

  tag(text, x, y, col, alpha, size) {
    if (!text) return;
    const g = this.g, f = Math.max(12, Math.min(20, size * .11));
    g.font = `800 ${f}px Inter,system-ui,sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
    const w = g.measureText(text).width + f * 1.1, h = f * 1.7;
    g.save(); g.translate(x, y); if (this.mirrored) g.scale(-1, 1);
    g.globalAlpha = alpha; g.fillStyle = "rgba(4,8,13,.82)"; g.beginPath(); g.roundRect ? g.roundRect(-w / 2, -h / 2, w, h, h / 3) : g.rect(-w / 2, -h / 2, w, h); g.fill();
    g.strokeStyle = col; g.lineWidth = 1.3; g.globalAlpha = alpha * .8; g.stroke();
    g.globalAlpha = alpha; g.fillStyle = "#fff"; g.fillText(text, 0, 1); g.restore();
  }
}
