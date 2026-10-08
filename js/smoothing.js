// One Euro filter (Casiez 2012): ít rung khi đứng yên, ít trễ khi chuyển động nhanh.
const alpha = (c, dt) => 1 / (1 + 1 / (2 * Math.PI * c) / dt);

export class OneEuro {
  constructor(minCutoff = 1.4, beta = 14, dCutoff = 1) { Object.assign(this, { minCutoff, beta, dCutoff, x: null, dx: 0, t: 0 }); }
  filter(v, t) {
    if (this.x === null) { this.x = v; this.t = t; return v; }
    const dt = Math.max(1e-3, (t - this.t) / 1000); this.t = t;
    this.dx += alpha(this.dCutoff, dt) * ((v - this.x) / dt - this.dx);
    this.x += alpha(this.minCutoff + this.beta * Math.abs(this.dx), dt) * (v - this.x);
    return this.x;
  }
}

export class LandmarkSmoother {
  constructor() { this.f = null; this.out = null; }
  apply(lm, t) {
    if (!this.f) {
      this.f = lm.map(() => [new OneEuro(), new OneEuro(), new OneEuro()]);
      this.out = lm.map(() => ({ x: 0, y: 0, z: 0, visibility: 1 }));
    }
    for (let i = 0; i < lm.length; i++) {            // tái sử dụng object → không tạo rác mỗi frame
      const p = lm[i], f = this.f[i], o = this.out[i];
      o.x = f[0].filter(p.x, t); o.y = f[1].filter(p.y, t); o.z = f[2].filter(p.z || 0, t);
      o.visibility = p.visibility;
    }
    return this.out;
  }
}
