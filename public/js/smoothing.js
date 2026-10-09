// SmoothSet v13: One Euro (đạo hàm lấy từ tín hiệu THÔ, đúng bản gốc) + vận tốc cấp bàn tay (palm anchor) + dự đoán thích nghi, có chặn.
// Mọi thứ theo timestamp thực (không giả định dt). Đơn vị toạ độ chuẩn hoá; tốc độ chuẩn hoá theo kích thước bàn tay (hand-widths/s).
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const alpha = (c, dt) => { const r = 6.2832 * c * dt; return r / (1 + r); };   // = 1/(1+tau/dt), tau = 1/(2π·c)

export class SmoothSet {
  constructor(n, o = {}) {
    const hand = n === 21;
    this.cfg = { minCutoff: 2, beta: 40, dCutoff: 6, tau: 0.006, maxV: 3, maxH: 0.05, gapMs: 250, reacqMs: 200, soft: 0.35, hard: 1.2, blend: 0.35,
      anchor: hand ? [0, 5, 9, 13, 17] : [1, 152, 10, 234, 454], scaleIdx: hand ? [0, 9] : [234, 454], scaleRef: hand ? 0.15 : 0.3, ...o };
    Object.assign(this, { n, has: false, last: 0, tAge: 0, alpha: 0, miss: 99, lead: 0, scale: this.cfg.scaleRef, rev: 0, reacq: 0, pe: 0, acc: 0, gain: 0, nOut: 0 });
    const m = n * 2;
    this.x = new Float32Array(m); this.v = new Float32Array(m); this.d = new Float32Array(m); this.r = new Float32Array(m);
    this.pv = new Float64Array(2); this.pvp = new Float64Array(2); this.pp = new Float64Array(2);   // vận tốc palm, trước đó, vị trí palm thô trước
    this._t = Array.from({ length: n }, () => ({ x: 0, y: 0 }));
  }
  reset() { this.has = false; }
  pushPacked(f, off, ts, tAge = ts, stride = 3) {                  // đọc thẳng Float32Array của worker, không cấp phát
    for (let i = 0; i < this.n; i++) { const p = this._t[i], o = off + i * stride; p.x = f[o]; p.y = f[o + 1]; }
    this.push(this._t, ts, tAge);
  }
  // ts = thời điểm đo (dùng cho dt/vận tốc) · tAge = thời điểm khung được trình chiếu (dùng cho tuổi dự đoán)
  push(lm, ts, tAge = ts) {
    const c = this.cfg, n = this.n, [ia, ib] = c.scaleIdx, A = c.anchor;
    let dt = (ts - this.last) / 1000; if (this.has && dt <= 0) { ts = this.last + 1; dt = 1e-3; }
    const gap = this.has && dt * 1000 > c.gapMs;
    this.last = ts; this.tAge = tAge;
    let px = 0, py = 0; for (const a of A) { px += lm[a].x; py += lm[a].y; } px /= A.length; py /= A.length;
    if (!this.has || gap) {                                        // khởi tạo / reacquire: KHÔNG teleport — x nhảy tới đo, d (hiển thị) giữ nguyên và trượt có giới hạn
      for (let i = 0; i < n; i++) { const j = i * 2; this.x[j] = this.r[j] = lm[i].x; this.x[j + 1] = this.r[j + 1] = lm[i].y; this.v[j] = this.v[j + 1] = 0; if (!this.has) { this.d[j] = lm[i].x; this.d[j + 1] = lm[i].y; } }
      this.pv[0] = this.pv[1] = this.pvp[0] = this.pvp[1] = 0; this.pp[0] = px; this.pp[1] = py; this.rev = 0; this.pe = 0; this.acc = 0;
      this.reacq = this.has ? 1 : 0; this.has = true; this.miss = 0; return;
    }
    const s = Math.hypot(lm[ia].x - lm[ib].x, lm[ia].y - lm[ib].y); if (s > 0.01) this.scale += (s - this.scale) * 0.2;
    const sc = Math.max(this.scale, 0.03), sf = c.scaleRef / sc, ad = alpha(c.dCutoff, dt);
    let fx = 0, fy = 0; for (const a of A) { fx += this.x[a * 2]; fy += this.x[a * 2 + 1]; } fx /= A.length; fy /= A.length;   // palm đã lọc TRƯỚC khi cập nhật
    for (let i = 0; i < n; i++) for (let k = 0; k < 2; k++) {
      const j = i * 2 + k, val = k ? lm[i].y : lm[i].x, pred = this.x[j] + this.v[j] * dt;
      const res = Math.abs(val - pred) / sc;                        // sai số đo đã chuẩn hoá theo kích thước tay
      const w = res < c.soft ? 1 : res < c.hard ? 1 / (1 + ((res - c.soft) / 0.4) ** 2) : 0.08;
      if (w < 1) this.nOut++;
      const v2 = pred + (val - pred) * w;                           // outlier → giảm tin cậy (không loại hẳn)
      const dx = (v2 - this.r[j]) / dt; this.r[j] = v2;             // ĐẠO HÀM TỪ TÍN HIỆU THÔ (bản cũ lấy từ output đã lọc → cutoff mở chậm)
      this.v[j] += ad * (dx - this.v[j]);
      this.x[j] += alpha(c.minCutoff + c.beta * Math.abs(this.v[j]) * sf, dt) * (v2 - this.x[j]);
    }
    // --- chuyển động cấp bàn tay: ổn định hơn từng điểm → dùng cho dự đoán ---
    const sp0 = Math.hypot(this.pv[0], this.pv[1]) / sc;
    this.pvp[0] = this.pv[0]; this.pvp[1] = this.pv[1];
    const ap = alpha(8, dt);
    this.pv[0] += ap * ((px - this.pp[0]) / dt - this.pv[0]); this.pv[1] += ap * ((py - this.pp[1]) / dt - this.pv[1]);
    const sp1 = Math.hypot(this.pv[0], this.pv[1]) / sc, dot = this.pvp[0] * this.pv[0] + this.pvp[1] * this.pv[1];
    if (sp0 > 0.25 && sp1 > 0.25 && dot < 0) this.rev = 1;           // đảo chiều
    else if (sp0 > 0.6 && sp1 < sp0 * 0.5) this.rev = Math.max(this.rev, 0.8);   // dừng đột ngột
    this.acc = Math.hypot(this.pv[0] - this.pvp[0], this.pv[1] - this.pvp[1]) / dt / sc;   // gia tốc chuẩn hoá (jerk lớn ⇒ acc nhảy)
    const err = Math.hypot(px - (fx + this.pvp[0] * dt), py - (fy + this.pvp[1] * dt)) / sc;   // sai số dự đoán thực tế (feedback)
    this.pe += (err - this.pe) * 0.15;
    this.pp[0] = px; this.pp[1] = py; this.has = true; this.miss = 0;
  }
  step(dt, visible, now) {
    const c = this.cfg, sc = Math.max(this.scale, 0.03);
    const age = Math.min(c.maxH, Math.max(0, (now - this.tAge) / 1000) + this.lead);   // MAX_PREDICTION_HORIZON
    const k = 1 - Math.exp(-dt / (c.tau + this.reacq * 0.05));                          // reacquire: sửa vị trí chậm lại, có giới hạn
    const sp = Math.hypot(this.pv[0], this.pv[1]) / sc;
    let g = clamp((sp - 0.15) / 0.45, 0, 1);                                            // đứng yên = không dự đoán (hết rung)
    g *= (1 - 0.85 * this.rev) * (1 - this.reacq) / (1 + (this.pe / 0.1) ** 2) / (1 + (this.acc / 40) ** 2);
    g *= Math.exp(-Math.max(0, (now - this.last) / 1000 - 0.06) / 0.05);              // mất khung: vận tốc suy giảm
    this.gain = g;
    for (let j = 0; j < this.d.length; j++) {
      const q = j & 1, vp = clamp(this.pv[q] + c.blend * (this.v[j] - this.pv[q]), -c.maxV, c.maxV);
      this.d[j] += (this.x[j] + vp * age * g - this.d[j]) * k;
    }
    this.rev *= Math.exp(-dt / 0.12); this.reacq = Math.max(0, this.reacq - dt * 1000 / c.reacqMs);
    this.alpha += ((visible ? 1 : 0) - this.alpha) * (1 - Math.exp(-dt / 0.06));
  }
}
