// Làm mượt + BÙ TRỄ: One Euro filter (chống rung) cho ra cả vận tốc → dự đoán vị trí tại thời điểm vẽ
// (x + v·(tuổi kết quả AI + độ trễ pipeline)), nên skeleton bám đúng ngón tay đang chuyển động.
const a = (c, dt) => 1 / (1 + 1 / (6.2832 * c) / dt);

export class SmoothSet {
  constructor(n, { minCutoff = 2, beta = 40, dCutoff = 6, tau = 0.012 } = {}) {
    Object.assign(this, { n, mc: minCutoff, b: beta, dc: dCutoff, tau, has: false, last: 0, alpha: 0, miss: 99, lead: 0.03 });
    this.x = new Float32Array(n * 2); this.v = new Float32Array(n * 2); this.d = new Float32Array(n * 2);
  }
  reset() { this.has = false; }
  push(lm, ts) {
    const dt = Math.max(1e-3, (ts - this.last) / 1000); this.last = ts;
    const ad = a(this.dc, dt);
    for (let i = 0; i < this.n; i++) for (let k = 0; k < 2; k++) {
      const j = i * 2 + k, val = k ? lm[i].y : lm[i].x;
      if (!this.has) { this.x[j] = this.d[j] = val; this.v[j] = 0; continue; }
      const prev = this.x[j];
      this.x[j] += a(this.mc + this.b * Math.abs(this.v[j]), dt) * (val - prev);
      this.v[j] += ad * ((this.x[j] - prev) / dt - this.v[j]);
    }
    this.has = true; this.miss = 0;
  }
  step(dt, visible, now) {                                       // gọi mỗi frame màn hình
    const age = Math.min(0.09, Math.max(0, (now - this.last) / 1000) + this.lead);
    const k = 1 - Math.exp(-dt / this.tau);
    for (let j = 0; j < this.d.length; j++) this.d[j] += (this.x[j] + this.v[j] * age * 0.9 - this.d[j]) * k;
    this.alpha += ((visible ? 1 : 0) - this.alpha) * (1 - Math.exp(-dt / 0.08));
  }
}
