// One Euro + dự đoán có kiểm soát. last = thời điểm GỬI khung cho AI (không phải lúc AI xong) nên
// age = (now − last) đã gồm: AI + truyền + chờ vẽ. Không cộng thêm `infer` nữa (bản cũ bị đếm đôi).
const a = (c, dt) => 1 / (1 + 1 / (6.2832 * c) / dt);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class SmoothSet {
  constructor(n, { minCutoff = 2, beta = 40, dCutoff = 6, tau = 0.006, maxV = 3, maxH = 0.05 } = {}) {
    Object.assign(this, { n, mc: minCutoff, b: beta, dc: dCutoff, tau, maxV, maxH, has: false, last: 0, alpha: 0, miss: 99, lead: 0 });
    this.x = new Float32Array(n * 2); this.v = new Float32Array(n * 2); this.d = new Float32Array(n * 2); this.rev = new Float32Array(n * 2);
    this._t = Array.from({ length: n }, () => ({ x: 0, y: 0 }));
  }
  reset() { this.has = false; }
  pushPacked(f, off, ts, stride = 3) {                    // đọc thẳng từ Float32Array của worker, không cấp phát
    for (let i = 0; i < this.n; i++) { const p = this._t[i], o = off + i * stride; p.x = f[o]; p.y = f[o + 1]; }
    this.push(this._t, ts);
  }
  push(lm, ts) {
    const dt = Math.max(1e-3, (ts - this.last) / 1000); this.last = ts;
    const ad = a(this.dc, dt);
    for (let i = 0; i < this.n; i++) for (let k = 0; k < 2; k++) {
      const j = i * 2 + k, val = k ? lm[i].y : lm[i].x;
      if (!this.has) { this.x[j] = this.d[j] = val; this.v[j] = 0; this.rev[j] = 0; continue; }
      const prev = this.x[j], vo = this.v[j];
      this.x[j] += a(this.mc + this.b * Math.abs(vo), dt) * (val - prev);
      this.v[j] += ad * ((this.x[j] - prev) / dt - vo);
      this.rev[j] = vo * this.v[j] < 0 && Math.abs(vo) > 0.05 ? 1 : this.rev[j] * 0.8;   // đảo chiều → giảm dự đoán
    }
    this.has = true; this.miss = 0;
  }
  step(dt, visible, now) {
    const age = Math.min(this.maxH, Math.max(0, (now - this.last) / 1000) + this.lead);   // tối đa 50ms
    const k = 1 - Math.exp(-dt / this.tau);
    for (let j = 0; j < this.d.length; j++) {
      const v = clamp(this.v[j], -this.maxV, this.maxV);
      const g = Math.min(1, Math.abs(v) / 0.12) * (1 - 0.7 * this.rev[j]);               // đứng yên = không dự đoán → hết rung
      this.d[j] += (this.x[j] + v * age * g - this.d[j]) * k;
    }
    this.alpha += ((visible ? 1 : 0) - this.alpha) * (1 - Math.exp(-dt / 0.06));
  }
}
