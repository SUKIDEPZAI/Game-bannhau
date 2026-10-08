// Phase state machine có hysteresis: UP → DOWN → UP = 1 rep (kiểu FormFlow / FormCheck).
export class PhaseCounter {
  constructor({ enter, exit, good }) { Object.assign(this, { enter, exit, good }); this.reset(); }
  reset() { this.phase = "up"; this.count = 0; this.min = 0; this.last = 0; }
  update(v, now) {
    if (this.phase === "up") { if (v < this.enter) { this.phase = "down"; this.min = v; } return null; }
    this.min = Math.min(this.min, v);
    if (v > this.exit) {
      this.phase = "up";
      if (now - this.last > 400) { this.last = now; this.count++; return { good: this.min <= this.good }; }
    }
    return null;
  }
}

export const makeCounters = () => ({
  squat: new PhaseCounter({ enter: 110, exit: 160, good: 100 }),     // góc gối
  push:  new PhaseCounter({ enter: 100, exit: 155, good: 90 }),      // góc khuỷu
  raise: new PhaseCounter({ enter: -0.10, exit: 0, good: -0.10 })    // cổ tay so với vai
});
