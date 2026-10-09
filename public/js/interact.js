// Tương tác bằng ĐẦU NGÓN TAY: mỗi vòng tròn đầu ngón (5/tay) là một "con trỏ". Rê lên nút → nút sáng (hover);
//  • GIỮ YÊN (dwell) ~0.7 s khi đang CHỈ TAY (≤2 ngón duỗi) → bấm, có vòng tiến trình quanh đầu ngón và trên nút;
//  • CHỤM (Pinch: ngón cái + trỏ) → bấm ngay nút ở giữa hai đầu ngón.
// Chống bấm nhầm: bàn tay xòe 5 ngón chỉ hover (không bấm); tay đang quét nhanh không tính giờ; cooldown theo nút.
// Logic thuần (nhận hàm query DOM) → test được ngoài trình duyệt.
const TIPS = [4, 8, 12, 16, 20];
const newUI = () => ({ x: new Float32Array(5), y: new Float32Array(5), prog: new Float32Array(5), hov: new Uint8Array(5), tgt: [null, null, null, null, null], t0: new Float64Array(5), fired: new Uint8Array(5), valid: false, pinch: false, flash: -1e9 });

export class Interact {
  constructor(canvas, cfg, query) { Object.assign(this, { cv: canvas, cfg, q: query, rects: [], scanT: -1e9, cr: { left: 0, top: 0, width: 1, height: 1 }, on: cfg.enabled, lastT: 0, frame: 0, hov: [], prevHov: [], clicks: 0 }); }
  scan(now) {
    this.scanT = now; const r = this.cv.getBoundingClientRect(); this.cr = { left: r.left, top: r.top, width: r.width || 1, height: r.height || 1 };
    const s = this.cfg.slopPx; this.rects.length = 0;
    for (const el of this.q()) { if (el.disabled) continue; const b = el.getBoundingClientRect(); if (b.width > 0 && b.height > 0) this.rects.push({ el, l: b.left - s, t: b.top - s, r: b.right + s, b: b.bottom + s }); }
  }
  hit(x, y) { for (const q of this.rects) if (x >= q.l && x <= q.r && y >= q.t && y <= q.b) return q.el; return null; }
  fire(el, now) {
    if (now - (el.__kbT ?? -1e9) < this.cfg.cooldownMs) return false;
    el.__kbT = now; el.classList.add("kb-press"); setTimeout(() => el.classList.remove("kb-press"), 220); this.clicks++; el.click(); return true;
  }
  mark(el, p) { if (el.__kbF !== this.frame) { el.__kbF = this.frame; el.__kbP = 0; this.hov.push(el); } if (p > el.__kbP) el.__kbP = p; }
  flush() {                                                       // chỉ ghi DOM cho nút đang hover / vừa rời
    for (const el of this.hov) { if (!el.__kbOn) { el.classList.add("kb-hover"); el.__kbOn = true; } const p = el.__kbP; if (Math.abs(p - (el.__kbS ?? 0)) > 0.02) { el.style.setProperty("--p", p.toFixed(2)); el.__kbS = p; } }
    for (const el of this.prevHov) if (el.__kbF !== this.frame && el.__kbOn) { el.classList.remove("kb-hover"); el.__kbOn = false; el.style.setProperty("--p", "0"); el.__kbS = 0; }
    const t = this.prevHov; this.prevHov = this.hov; this.hov = t; this.hov.length = 0;
  }
  release(ui) { ui.valid = false; ui.pinch = false; ui.prog.fill(0); ui.hov.fill(0); ui.fired.fill(0); ui.tgt.fill(null); }
  // slots[i] = { set (SmoothSet: d, ui), vis, g (GestureTracker: ext, thumb), label }
  update(now, slots, mirrored, vw, vh) {
    this.frame++;
    if (!this.on) { for (const s of slots) if (s.set.ui) this.release(s.set.ui); this.flush(); return; }
    if (now - this.scanT > this.cfg.rescanMs) this.scan(now);
    const dt = Math.max(0.001, (now - this.lastT) / 1000), c = this.cfg, cr = this.cr; this.lastT = now;
    const sc = Math.max(cr.width / vw, cr.height / vh), ox = (cr.width - vw * sc) / 2, oy = (cr.height - vh * sc) / 2;   // object-fit: cover
    for (const s of slots) {
      const ui = s.set.ui ??= newUI(); if (!s.vis) { this.release(ui); continue; }
      const d = s.set.d, g = s.g; let nExt = 0; for (let f = 0; f < 4; f++) if (g.ext[f] === 1) nExt++;
      for (let k = 0; k < 5; k++) {
        const i = TIPS[k]; let sx = ox + d[i * 2] * vw * sc; if (mirrored) sx = cr.width - sx; sx += cr.left; const sy = cr.top + oy + d[i * 2 + 1] * vh * sc;
        const spd = ui.valid ? Math.hypot(sx - ui.x[k], sy - ui.y[k]) / dt : 1e9; ui.x[k] = sx; ui.y[k] = sy;
        const el = this.hit(sx, sy);
        if (el !== ui.tgt[k]) { ui.tgt[k] = el; ui.t0[k] = now; ui.fired[k] = 0; ui.prog[k] = 0; }
        ui.hov[k] = el ? 1 : 0;
        if (el && !ui.fired[k]) {
          const ext = k === 0 ? g.thumb === 1 : g.ext[k - 1] === 1, ok = c.dwellAllTips || (ext && nExt <= 2);
          if (ok && spd < c.maxSpeedPx) { const p = Math.min(1, (now - ui.t0[k]) / c.dwellMs); ui.prog[k] = p; if (p >= 1) { this.fire(el, now); ui.fired[k] = 1; ui.flash = now; ui.prog[k] = 0; } }
          else { ui.t0[k] = now; ui.prog[k] = 0; }               // đang quét nhanh / không phải tư thế chỉ → tính lại từ đầu
        }
        if (el) this.mark(el, ui.prog[k]);
      }
      ui.valid = true;
      const pin = c.pinchClick && s.label === "Pinch";           // cạnh lên của Pinch đã xác nhận (có hysteresis + xác nhận ms)
      if (pin && !ui.pinch) { const el = this.hit((ui.x[0] + ui.x[1]) / 2, (ui.y[0] + ui.y[1]) / 2) || ui.tgt[1]; if (el && this.fire(el, now)) ui.flash = now; }
      ui.pinch = pin;
    }
    this.flush();
  }
}
