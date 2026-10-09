// Bộ điều khiển hiệu năng thích nghi: hạ cấp từng bước khi P95 vượt ngân sách LIÊN TỤC; phục hồi chậm hơn (hysteresis + cooldown) → không dao động.
// level 0: nguyên profile · 1: tắt tia laser + vệt · 2: + tắt glow · 3: + tắt nhãn chữ. (Không đụng tới skeleton/gesture/tương tác.)
export class PerfController {
  constructor(cfg) { this.c = cfg; this.level = 0; this.badSince = 0; this.goodSince = 0; this.lastChange = -1e9; }
  update(now, m) {                                               // m = { aiP95, ageP95, renderP95 } → level mới nếu đổi, ngược lại null
    const c = this.c, over = m.aiP95 > c.aiP95Budget || m.ageP95 > c.ageP95Budget || m.renderP95 > c.renderP95Budget;
    const calm = m.aiP95 < c.aiP95Budget * 0.7 && m.ageP95 < c.ageP95Budget * 0.7 && m.renderP95 < c.renderP95Budget * 0.7;
    this.badSince = over ? (this.badSince || now) : 0; this.goodSince = calm ? (this.goodSince || now) : 0;
    if (now - this.lastChange < c.cooldownMs) return null;
    if (over && now - this.badSince >= c.degradeAfterMs && this.level < 3) { this.level++; this.lastChange = now; this.badSince = 0; return this.level; }
    if (calm && now - this.goodSince >= c.recoverAfterMs && this.level > 0) { this.level--; this.lastChange = now; this.goodSince = 0; return this.level; }
    return null;
  }
  applyFx(fx, base) { Object.assign(fx, base); const L = this.level; if (L >= 1) fx.lasers = fx.trail = false; if (L >= 2) fx.glow = false; if (L >= 3) fx.text = false; }
}
