// Chỉ vẽ skeleton bàn tay + đầu. Không shadowBlur: glow = 3 lớp nét, mỗi nhóm 1 Path2D.
const FINGER = ["#ff4fa3", "#ffdc3a", "#00f5a0", "#45a3ff", "#b96cff", "#e8f4ff"];   // cái, trỏ, giữa, nhẫn, út, lòng bàn tay
const TIPS = [4, 8, 12, 16, 20], PALM = new Set([0, 5, 9, 13, 17]);
const HEAD = "#72f2ff";

export class Renderer {
  mirrored = true;
  constructor(canvas) { this.c = canvas; this.g = canvas.getContext("2d", { desynchronized: true }); }
  resize(w, h) { if (this.c.width !== w || this.c.height !== h) { this.c.width = w; this.c.height = h; } }
  clear() { this.g.clearRect(0, 0, this.c.width, this.c.height); }

  layers(path, col, w, alpha) {
    const g = this.g; g.strokeStyle = col;
    g.globalAlpha = alpha * .14; g.lineWidth = w * 4.2; g.stroke(path);
    g.globalAlpha = alpha * .4;  g.lineWidth = w * 2;   g.stroke(path);
    g.globalAlpha = alpha * .95; g.lineWidth = w * .75; g.strokeStyle = "#fff"; g.stroke(path);
  }

  hand(s, conn, label, color) {
    if (s.alpha < .02) return;
    const g = this.g, W = this.c.width, H = this.c.height, d = s.d;
    const px = (i) => d[i * 2] * W, py = (i) => d[i * 2 + 1] * H;
    const size = Math.hypot(px(0) - px(9), py(0) - py(9)), w = Math.max(2, size * .035);
    g.lineCap = g.lineJoin = "round";
    const paths = FINGER.map(() => new Path2D());
    for (const { start: a, end: b } of conn) {
      const grp = PALM.has(a) && PALM.has(b) ? 5 : Math.floor((Math.max(a, b) - 1) / 4);
      paths[grp].moveTo(px(a), py(a)); paths[grp].lineTo(px(b), py(b));
    }
    paths.forEach((p, i) => this.layers(p, FINGER[i], w, s.alpha));
    for (let i = 0; i < 21; i++) {
      const tip = TIPS.includes(i), r = size * (tip ? .045 : .028);
      g.globalAlpha = s.alpha; g.fillStyle = tip ? FINGER[TIPS.indexOf(i)] : "#fff";
      g.beginPath(); g.arc(px(i), py(i), r, 0, 6.2832); g.fill();
      if (tip) { g.fillStyle = "#fff"; g.beginPath(); g.arc(px(i), py(i), r * .45, 0, 6.2832); g.fill(); }
    }
    this.tag(label, px(12), Math.min(py(8), py(12), py(16)) - size * .35, color || "#fff", s.alpha, size);
  }

  head(s, conn) {
    if (s.alpha < .02) return;
    const g = this.g, W = this.c.width, H = this.c.height, d = s.d;
    const p = new Path2D(); let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    for (let i = 0; i < 478; i++) { const x = d[i * 2], y = d[i * 2 + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    for (const { start: a, end: b } of conn) { p.moveTo(d[a * 2] * W, d[a * 2 + 1] * H); p.lineTo(d[b * 2] * W, d[b * 2 + 1] * H); }
    g.lineCap = g.lineJoin = "round";
    const size = (y1 - y0) * H, w = Math.max(1.6, size * .008);
    this.layers(p, HEAD, w, s.alpha);
    // Khung ngắm 4 góc quanh đầu
    const m = size * .08, L = size * .12, X0 = x0 * W - m, Y0 = y0 * H - m, X1 = x1 * W + m, Y1 = y1 * H + m;
    const br = new Path2D();
    for (const [x, y, sx, sy] of [[X0, Y0, 1, 1], [X1, Y0, -1, 1], [X0, Y1, 1, -1], [X1, Y1, -1, -1]]) {
      br.moveTo(x + sx * L, y); br.lineTo(x, y); br.lineTo(x, y + sy * L);
    }
    g.globalAlpha = s.alpha * .9; g.strokeStyle = HEAD; g.lineWidth = w * 1.6; g.stroke(br);
    this.tag("HEAD", (X0 + X1) / 2, Y0 - size * .07, HEAD, s.alpha, size * .6);
    g.globalAlpha = 1;
  }

  tag(text, x, y, col, alpha, size) {
    if (!text) return;
    const g = this.g, f = Math.max(12, Math.min(20, size * .11));
    g.font = `800 ${f}px Inter,system-ui,sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
    const w = g.measureText(text).width + f * 1.1, h = f * 1.7;
    g.save(); g.translate(x, y); if (this.mirrored) g.scale(-1, 1);
    g.globalAlpha = alpha; g.fillStyle = "rgba(4,8,13,.82)"; g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, h / 3); g.fill();
    g.strokeStyle = col; g.lineWidth = 1.3; g.globalAlpha = alpha * .8; g.stroke();
    g.globalAlpha = alpha; g.fillStyle = "#fff"; g.fillText(text, 0, 1); g.restore();
  }
}
