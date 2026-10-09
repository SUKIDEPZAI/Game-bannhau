// Bộ điều khiển hiệu năng thích nghi: hạ cấp từng bước (face → hiệu ứng) khi P95 vượt ngân sách LIÊN TỤC; phục hồi chậm hơn (hysteresis + cooldown) → không dao động.
export class PerfController {
  constructor(cfg) { this.c = cfg; this.level = 0; this.badSince = 0; this.goodSince = 0; this.lastChange = -1e9; }
  // m = { aiP95, ageP95, renderP95 } · trả về level mới nếu đổi, ngược lại null
  update(now, m) {
    const c = this.c, over = m.aiP95 > c.aiP95Budget || m.ageP95 > c.ageP95Budget || m.renderP95 > c.renderP95Budget;
    const calm = m.aiP95 < c.aiP95Budget * 0.7 && m.ageP95 < c.ageP95Budget * 0.7 && m.renderP95 < c.renderP95Budget * 0.7;
    this.badSince = over ? (this.badSince || now) : 0; this.goodSince = calm ? (this.goodSince || now) : 0;
    if (now - this.lastChange < c.cooldownMs) return null;
    if (over && now - this.badSince >= c.degradeAfterMs && this.level < 3) { this.level++; this.lastChange = now; this.badSince = 0; return this.level; }
    if (calm && now - this.goodSince >= c.recoverAfterMs && this.level > 0) { this.level--; this.lastChange = now; this.goodSince = 0; return this.level; }
    return null;
  }
  // level 0: nguyên profile · 1: face ½ tần số · 2: tắt face · 3: tắt hiệu ứng nặng
  get faceScale() { return this.level === 0 ? 1 : this.level === 1 ? 0.5 : 0; }
  get fxOff() { return this.level >= 3; }
}
