// Telemetry: vòng đệm cố định (không cấp phát khi ghi) + percentile P50/P90/P95/P99/MAX. Chỉ sort khi cập nhật HUD.
export class Metric {
  constructor(n = 240) { this.a = new Float32Array(n); this.s = new Float32Array(n); this.i = 0; this.n = 0; }
  push(v) { this.a[this.i] = v; this.i = (this.i + 1) % this.a.length; if (this.n < this.a.length) this.n++; }
  stats(out = {}) {
    const n = this.n; if (!n) return Object.assign(out, { p50: 0, p90: 0, p95: 0, p99: 0, max: 0 });
    const s = this.s.subarray(0, n); s.set(this.a.subarray(0, n)); s.sort();
    const q = (p) => s[Math.min(n - 1, Math.floor(p * (n - 1) + 0.5))];
    out.p50 = q(0.5); out.p90 = q(0.9); out.p95 = q(0.95); out.p99 = q(0.99); out.max = s[n - 1]; return out;
  }
}
export const fmtP = (m) => { const s = m.stats(); return `${s.p50.toFixed(1)}/${s.p95.toFixed(1)}/${s.p99.toFixed(1)}/${s.max.toFixed(1)}`; };

// Recorder xác định: lưu timestamp + landmark thô → replay cùng thuật toán = cùng kết quả (A/B). Phím R trong app: bắt đầu/dừng và tải JSONL.
export class Recorder {
  constructor() { this.on = false; this.rows = []; }
  toggle() { this.on = !this.on; if (this.on) this.rows = []; return this.on; }
  push(m) { if (this.on && !m.faceOnly && this.rows.length < 20000) this.rows.push({ ts: m.ts, tc: m.tc, nh: m.nh, h: Array.from(m.hands) }); }
  toJSONL() { return this.rows.map((r) => JSON.stringify(r)).join("\n"); }
}
