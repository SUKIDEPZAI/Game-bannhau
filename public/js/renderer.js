// Skeleton TAY v14 (không còn đầu/mặt). Phong cách: XƯƠNG (mặc định) · NEON · WIRE · HOLO.
// XƯƠNG: xương bàn tay (wrist→MCP) + đốt ngón (MCP→PIP→DIP→TIP) vẽ như xương: thân sáng, viền tối, khớp tròn nhỏ dần về phía đầu ngón.
// Đầu ngón = VÒNG TRÒN tương tác (hover sáng lên, vòng tiến trình khi giữ yên, gợn sóng khi bấm). Không cấp phát trong vòng vẽ; mỗi lớp gộp 1 path.
const FINGER = ["#ff4fa3", "#ffdc3a", "#00f5a0", "#45a3ff", "#b96cff", "#e8f4ff"];
const TIPS = [4, 8, 12, 16, 20], TAU = 6.2832, ACC = "#72f2ff", BONE = "#f2f6fb", INK = "#04101a";
const TIPK = (() => { const a = new Int8Array(21).fill(-1); TIPS.forEach((v, k) => a[v] = k); return a; })();
const PALM = new Set([0, 5, 9, 13, 17]);
export const STYLES = ["XƯƠNG", "NEON", "WIRE", "HOLO"];
const grp = (a, b) => PALM.has(a) && PALM.has(b) ? 5 : Math.floor((Math.max(a, b) - 1) / 4);
// Giải phẫu: xương bàn (metacarpal, dày) tách khỏi đốt ngón (phalanges, mảnh).
const META = [[0, 1], [1, 2], [0, 5], [0, 9], [0, 13], [0, 17]];
const PHAL = [[2, 3], [3, 4], [5, 6], [6, 7], [7, 8], [9, 10], [10, 11], [11, 12], [13, 14], [14, 15], [15, 16], [17, 18], [18, 19], [19, 20]];
const LINK = [[5, 9], [9, 13], [13, 17]], PALMPOLY = [0, 1, 5, 9, 13, 17];
const KNOB = (() => { const k = new Float32Array(21); k[0] = .075; k[1] = .05; k[2] = .045; k[3] = .038; for (const f of [5, 9, 13, 17]) { k[f] = .052; k[f + 1] = .042; k[f + 2] = .034; } return k; })();

export class Renderer {
  mirrored = true; style = 0; fx = { glow: true, trail: true, text: true, lasers: true };
  constructor(canvas) { this.c = canvas; this.g = canvas.getContext("2d", { desynchronized: true }); }
  resize(w, h) { if (this.c.width !== w || this.c.height !== h) { this.c.width = w; this.c.height = h; } }
  clear() { this.g.clearRect(0, 0, this.c.width, this.c.height); }

  layers(col, w, al, glow = 1) {                                   // stroke đường đang dựng trên ctx (nhiều lớp glow)
    const g = this.g; g.strokeStyle = col;
    if (glow && this.fx.glow) { g.globalAlpha = al * .14; g.lineWidth = w * 4.2; g.stroke(); g.globalAlpha = al * .4; g.lineWidth = w * 2; g.stroke(); }
    g.globalAlpha = al * .95; g.lineWidth = w * .75; g.strokeStyle = glow ? "#fff" : col; g.stroke();
  }

  hand(s, conn, label, now = performance.now()) {
    if (this.fx.trail) this.trail(s, now); if (s.alpha < .02) return;
    const g = this.g, W = this.c.width, H = this.c.height, d = s.d, al = s.alpha;
    const size = Math.hypot((d[0] - d[18]) * W, (d[1] - d[19]) * H);   // wrist → MCP giữa (landmark 9)
    g.lineCap = g.lineJoin = "round";
    if (this.style === 0) this.bones(d, size, al, W, H); else this.lines(d, conn, size, al, W, H, this.style);
    this.tips(s, size, al, W, H, now);
    if (this.fx.trail) this.drawTrail(s, size, now);
    if (this.fx.text) this.tag(label, d[24] * W, Math.min(d[17], d[25], d[33]) * H - size * .55, "#fff", al, size);
  }

  // ---- XƯƠNG ----
  bonePass(d, W, H, list, w, al, glow) {
    const g = this.g; g.beginPath();
    for (let i = 0; i < list.length; i++) { const a = list[i][0], b = list[i][1]; g.moveTo(d[a * 2] * W, d[a * 2 + 1] * H); g.lineTo(d[b * 2] * W, d[b * 2 + 1] * H); }
    if (glow) { g.globalAlpha = al * .16; g.strokeStyle = ACC; g.lineWidth = w * 3.4; g.stroke(); }
    g.globalAlpha = al * .62; g.strokeStyle = INK; g.lineWidth = w * 1.8; g.stroke();   // viền tối → nổi trên video
    g.globalAlpha = al; g.strokeStyle = BONE; g.lineWidth = w * .85; g.stroke();         // thân xương
  }
  bones(d, size, al, W, H) {
    const g = this.g, w = Math.max(2.2, size * .05), glow = this.fx.glow;
    g.beginPath(); for (let k = 0; k < PALMPOLY.length; k++) { const i = PALMPOLY[k]; k ? g.lineTo(d[i * 2] * W, d[i * 2 + 1] * H) : g.moveTo(d[i * 2] * W, d[i * 2 + 1] * H); } g.closePath();
    g.globalAlpha = al * .13; g.fillStyle = ACC; g.fill(); g.globalAlpha = al * .35; g.strokeStyle = ACC; g.lineWidth = Math.max(1, w * .3); g.stroke();   // mô lòng bàn tay
    this.bonePass(d, W, H, META, w * 1.25, al, glow); this.bonePass(d, W, H, PHAL, w * .85, al, glow);
    g.beginPath(); for (let i = 0; i < 3; i++) { const a = LINK[i][0], b = LINK[i][1]; g.moveTo(d[a * 2] * W, d[a * 2 + 1] * H); g.lineTo(d[b * 2] * W, d[b * 2 + 1] * H); }
    g.globalAlpha = al * .5; g.strokeStyle = BONE; g.lineWidth = Math.max(1, w * .35); g.stroke();                                                       // gân nối đầu xương bàn
    g.beginPath(); for (let i = 0; i < 21; i++) if (TIPK[i] < 0) { const r = size * KNOB[i], x = d[i * 2] * W, y = d[i * 2 + 1] * H; g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); }
    g.globalAlpha = al; g.fillStyle = BONE; g.fill(); g.globalAlpha = al * .8; g.strokeStyle = INK; g.lineWidth = Math.max(1, size * .014); g.stroke();   // khớp
  }

  // ---- NEON / WIRE / HOLO (đường nối kiểu cũ, đầu ngón vẽ bằng tips()) ----
  lines(d, conn, size, al, W, H, st) {
    const g = this.g, w = Math.max(2, size * .035);
    if (st === 3) { g.globalAlpha = al * .14; g.fillStyle = ACC; g.beginPath(); for (let k = 0; k < PALMPOLY.length; k++) { const i = PALMPOLY[k]; k ? g.lineTo(d[i * 2] * W, d[i * 2 + 1] * H) : g.moveTo(d[i * 2] * W, d[i * 2 + 1] * H); } g.fill(); g.setLineDash([size * .07, size * .05]); }
    for (let i = 0; i < 6; i++) {
      g.beginPath(); for (const { start: a, end: b } of conn) if (grp(a, b) === i) { g.moveTo(d[a * 2] * W, d[a * 2 + 1] * H); g.lineTo(d[b * 2] * W, d[b * 2 + 1] * H); }
      this.layers(FINGER[i], st === 2 ? Math.max(1.2, size * .016) : w, al, st === 2 ? 0 : 1);
    }
    g.setLineDash([]);
    for (let i = 0; i < 21; i++) if (TIPK[i] < 0) {
      const x = d[i * 2] * W, y = d[i * 2 + 1] * H, r = size * .028; g.globalAlpha = al; g.fillStyle = g.strokeStyle = "#fff"; g.lineWidth = Math.max(1.2, size * .012); g.beginPath();
      if (st === 2) { g.moveTo(x, y - r * 1.3); g.lineTo(x + r * 1.3, y); g.lineTo(x, y + r * 1.3); g.lineTo(x - r * 1.3, y); g.closePath(); g.fill(); }
      else if (st === 3) { g.arc(x, y, r * 1.2, 0, TAU); g.stroke(); } else { g.arc(x, y, r, 0, TAU); g.fill(); }
    }
  }

  // ---- ĐẦU NGÓN: vòng tròn tương tác (dùng chung mọi phong cách) ----
  tips(s, size, al, W, H, now) {
    const g = this.g, d = s.d, ui = s.ui, base = Math.max(6, size * .085), lw = Math.max(2, size * .022);
    for (let k = 0; k < 5; k++) {
      const i = TIPS[k], x = d[i * 2] * W, y = d[i * 2 + 1] * H, hov = ui ? ui.hov[k] : 0, pr = ui ? ui.prog[k] : 0, r = base * (hov ? 1.3 : 1);
      g.beginPath(); g.arc(x, y, r, 0, TAU);
      g.globalAlpha = al * (hov ? .45 : .26); g.fillStyle = FINGER[k]; g.fill();                      // nền mờ
      g.globalAlpha = al; g.strokeStyle = hov ? "#fff" : FINGER[k]; g.lineWidth = hov ? lw * 1.3 : lw; g.stroke();   // viền
      g.fillStyle = "#fff"; g.beginPath(); g.arc(x, y, r * .3, 0, TAU); g.fill();                     // chấm tâm
      if (pr > 0) { g.strokeStyle = "#fff"; g.lineWidth = Math.max(3, size * .035); g.beginPath(); g.arc(x, y, r + size * .04, -1.5708, -1.5708 + TAU * pr); g.stroke(); }   // vòng tiến trình giữ yên
    }
    if (ui && now - ui.flash < 320) {                                                                 // gợn sóng khi vừa bấm
      const f = (now - ui.flash) / 320; g.strokeStyle = "#00f5a0"; g.lineWidth = Math.max(2, size * .03) * (1 - f); g.globalAlpha = al * (1 - f);
      for (let k = 0; k < 5; k++) if (ui.hov[k] || k < 2) { g.beginPath(); g.arc(d[TIPS[k] * 2] * W, d[TIPS[k] * 2 + 1] * H, base * (1.4 + f * 2.2), 0, TAU); g.stroke(); }
    }
    g.globalAlpha = 1;
  }

  lasers(a, b) {                                                   // tia sáng giữa đầu ngón hai tay
    if (!this.fx.lasers) return;
    const al = Math.min(a.alpha, b.alpha); if (al < .05) return;
    const g = this.g, W = this.c.width, H = this.c.height; g.lineCap = "round";
    TIPS.forEach((i, k) => { g.beginPath(); g.moveTo(a.d[i * 2] * W, a.d[i * 2 + 1] * H); g.lineTo(b.d[i * 2] * W, b.d[i * 2 + 1] * H); this.layers(FINGER[k], Math.max(1.5, W / 520), al * .35); });
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
