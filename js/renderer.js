// Vẽ skeleton neon. Tối ưu: không dùng shadowBlur (rất tốn GPU) — glow = nhiều lớp nét mờ,
// mỗi lớp là 1 Path2D gộp toàn bộ xương → chỉ vài lệnh stroke mỗi người mỗi frame.
import { BONES, ok, L } from "./angleUtils.js";
export const COLORS = ["#00f5a0", "#45a3ff", "#ffdc3a", "#ff4fa3", "#b96cff", "#ff7b52", "#72f2ff", "#d4ff59"];

export class Renderer {
  constructor(canvas) { this.c = canvas; this.g = canvas.getContext("2d", { desynchronized: true }); this.mirrored = true; }
  resize(w, h) { if (this.c.width !== w || this.c.height !== h) { this.c.width = w; this.c.height = h; } }
  clear() { this.g.clearRect(0, 0, this.c.width, this.c.height); }

  draw(t, now) {
    const g = this.g, W = this.c.width, H = this.c.height, u = W / 900, m = t.lm;
    const col = t.warnUntil > now ? "#ffb020" : COLORS[(t.id - 1) % COLORS.length];
    g.lineCap = g.lineJoin = "round";

    // Vệt chuyển động hai cổ tay
    const tr = t.trail;
    if (tr.length > 1) {
      const p = new Path2D();
      for (const k of [0, 2]) { p.moveTo(tr[0][k] * W, tr[0][k + 1] * H); for (const q of tr) p.lineTo(q[k] * W, q[k + 1] * H); }
      g.globalAlpha = .3; g.strokeStyle = col; g.lineWidth = 5 * u; g.stroke(p);
    }

    const bones = new Path2D();
    for (const [a, b] of BONES) {
      if (!ok(m[a]) || !ok(m[b])) continue;
      bones.moveTo(m[a].x * W, m[a].y * H); bones.lineTo(m[b].x * W, m[b].y * H);
    }
    g.strokeStyle = col;
    g.globalAlpha = .14; g.lineWidth = 16 * u; g.stroke(bones);   // glow ngoài
    g.globalAlpha = .38; g.lineWidth = 7 * u;  g.stroke(bones);   // glow trong
    g.globalAlpha = .95; g.lineWidth = 2.4 * u; g.strokeStyle = "#fff"; g.stroke(bones); // lõi

    const dots = new Path2D(), cores = new Path2D();
    for (let i = 0; i < m.length; i++) {
      const p = m[i]; if (!ok(p)) continue;
      const r = (3.2 + (i > 10 ? 1.6 : 0)) * u * clampZ(p.z);
      dots.moveTo(p.x * W + r, p.y * H); dots.arc(p.x * W, p.y * H, r, 0, 6.2832);
      cores.moveTo(p.x * W + r * .45, p.y * H); cores.arc(p.x * W, p.y * H, r * .45, 0, 6.2832);
    }
    g.globalAlpha = .9; g.fillStyle = col; g.fill(dots);
    g.globalAlpha = 1; g.fillStyle = "#fff"; g.fill(cores);

    // Nhãn (đảo ngược chữ khi canvas bị lật gương)
    const head = ok(m[L.nose]) ? m[L.nose] : m[L.ls];
    const label = `ID ${t.id} · ${t.action} · ${total(t)} rep`;
    g.font = `800 ${Math.max(13, 17 * u)}px Inter,system-ui,sans-serif`;
    g.textAlign = "center"; g.textBaseline = "middle";
    const w = g.measureText(label).width + 18 * u, hh = 26 * u, x = head.x * W, y = head.y * H - 54 * u;
    g.save(); g.translate(x, y); if (this.mirrored) g.scale(-1, 1);
    g.fillStyle = "rgba(4,8,13,.82)"; g.beginPath(); g.roundRect(-w / 2, -hh / 2, w, hh, 8 * u); g.fill();
    g.strokeStyle = col; g.lineWidth = 1.5 * u; g.globalAlpha = .8; g.stroke();
    g.globalAlpha = 1; g.fillStyle = "#fff"; g.fillText(label, 0, 1); g.restore();
    g.globalAlpha = 1;
  }
}
const clampZ = (z = 0) => Math.max(.75, Math.min(1.3, 1 - z * .5));
export const total = (t) => t.reps.squat.count + t.reps.push.count + t.reps.raise.count;
