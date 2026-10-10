// Three lightweight, local specialist agents. These are adaptive decision systems,
// not three additional neural networks; they never add inference to the hot path.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class LatencyAgent {
  constructor() { this.state = 'WARMUP'; this.recommendation = 'Đang thu thập mẫu'; this.last = null; }
  update({ aiP95 = 0, ageP95 = 0, renderP95 = 0, dropped = 0, fps = 0, samples = 0 } = {}) {
    if (samples < 8) return this.snapshot();
    if (aiP95 > 80) { this.state = 'INFERENCE_BOUND'; this.recommendation = 'Giảm kích thước input/model; kiểm tra GPU delegate'; }
    else if (ageP95 > 100 || dropped > 8) { this.state = 'SCHEDULING_BOUND'; this.recommendation = 'Ưu tiên latest-frame, kiểm tra capture timestamp và Worker queue'; }
    else if (renderP95 > 8) { this.state = 'RENDER_BOUND'; this.recommendation = 'Tắt glow/trails/lasers và giảm số lệnh Canvas'; }
    else if (fps > 0 && fps < 25) { this.state = 'DEVICE_BOUND'; this.recommendation = 'Kiểm tra camera FPS, CPU/GPU và chế độ tiết kiệm pin'; }
    else { this.state = 'NOMINAL'; this.recommendation = 'Không cần hạ chất lượng thêm lúc này'; }
    return this.snapshot();
  }
  snapshot() { return { state: this.state, recommendation: this.recommendation }; }
}

export class TrackingQualityAgent {
  constructor() { this.score = 0; this.samples = 0; this.misses = 0; this.state = 'WARMUP'; }
  observe({ landmarks = null, detected = false, stale = false } = {}) {
    this.samples++;
    if (!detected || stale || !landmarks?.length) this.misses++;
    let confidence = 0.55;
    if (landmarks?.length) {
      let valid = 0, total = 0;
      for (const p of landmarks) { total++; if (Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= -0.1 && p.x <= 1.1 && p.y >= -0.1 && p.y <= 1.1) valid++; }
      confidence = total ? valid / total : 0;
    }
    const target = detected && !stale ? confidence : 0;
    this.score += (target - this.score) * 0.18;
    this.state = this.samples < 8 ? 'WARMUP' : this.score > 0.85 ? 'GOOD' : this.score > 0.55 ? 'FAIR' : 'LOW';
    return this.snapshot();
  }
  snapshot() { return { score: Math.round(clamp(this.score, 0, 1) * 100), state: this.state, missRate: this.samples ? this.misses / this.samples : 0 }; }
}

export class GestureAgent {
  constructor() { this.speedEma = 0; this.stability = 0; this.mode = 'NORMAL'; }
  observe(speed = 0, trackingScore = 1) {
    speed = Number.isFinite(speed) ? Math.max(0, speed) : 0;
    this.speedEma += (speed - this.speedEma) * 0.22;
    this.stability += ((1 - Math.min(1, Math.abs(speed - this.speedEma) * 0.25)) - this.stability) * 0.12;
    this.mode = trackingScore < 0.5 ? 'CAUTIOUS' : this.speedEma > 1.5 ? 'FAST_MOTION' : this.stability > 0.75 ? 'STABLE' : 'NORMAL';
    return this.snapshot();
  }
  snapshot() { return { mode: this.mode, speed: Math.round(this.speedEma * 100) / 100, stability: Math.round(this.stability * 100) / 100 }; }
}

export class AIAgentSuite {
  constructor() { this.latency = new LatencyAgent(); this.tracking = new TrackingQualityAgent(); this.gesture = new GestureAgent(); }
  snapshot() { return { latency: this.latency.snapshot(), tracking: this.tracking.snapshot(), gesture: this.gesture.snapshot() }; }
}
