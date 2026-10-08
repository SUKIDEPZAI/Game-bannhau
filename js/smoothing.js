// 2 tầng làm mượt: (1) One Euro filter chống rung theo từng toạ độ,
// (2) nội suy mũ ở tốc độ màn hình (60Hz+) → skeleton trượt mượt kể cả khi AI chỉ chạy ~30Hz.
const a = (c, dt) => 1 / (1 + 1 / (6.2832 * c) / dt);

export class SmoothSet {
  constructor(n, { minCutoff = 1.6, beta = 18, tau = 0.028 } = {}) {
    Object.assign(this, { n, mc: minCutoff, b: beta, tau, has: false, last: 0, alpha: 0, miss: 99 });
    this.x = new Float32Array(n * 2); this.v = new Float32Array(n * 2); this.d = new Float32Array(n * 2);
  }
  reset() { this.has = false; }
  push(lm, ts) {
    const dt = Math.max(1e-3, (ts - this.last) / 1000); this.last = ts;
    const ad = a(1, dt);
    for (let i = 0; i < this.n; i++) for (let k = 0; k < 2; k++) {
      const j = i * 2 + k, val = k ? lm[i].y : lm[i].x;
      if (!this.has) { this.x[j] = this.d[j] = val; this.v[j] = 0; continue; }
      this.v[j] += ad * ((val - this.x[j]) / dt - this.v[j]);
      this.x[j] += a(this.mc + this.b * Math.abs(this.v[j]), dt) * (val - this.x[j]);
    }
    this.has = true; this.miss = 0;
  }
  step(dt, visible) {                                  // gọi mỗi frame màn hình
    const k = 1 - Math.exp(-dt / this.tau);
    for (let j = 0; j < this.d.length; j++) this.d[j] += (this.x[j] - this.d[j]) * k;
    this.alpha += ((visible ? 1 : 0) - this.alpha) * (1 - Math.exp(-dt / 0.09));   // fade vào/ra
  }
}
