import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { patchWonderSnapApp, patchWonderSnapGestures, localizeWonderSnapHtml, localizeWonderSnapFeatures } from '../scripts/wondersnap-upgrade.mjs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const fixtureApp = [
"const CATEGORIES = [...new Set(CATALOG.map((d) => d.category))];",
"const POSE_UI = { [OPEN]: ['✋', 'Open hand'], [FIST]: ['✊', 'Fist'], [PEACE]: ['✌', 'Peace'], [POINT]: ['☝', 'Pointing'], other: ['🤚', 'Moving'], [NONE]: ['·', 'No hand'] };",
"const [emo, label] = pose === 'pinch' ? ['🤏', 'Pinch'] : POSE_UI[pose] || POSE_UI.other;",
"class App {",
"  drawHand(g, lm, col, dpr) {",
"    const P = lm.map((p) => this.toScreen(p));",
"    g.lineWidth = 2 * dpr; g.strokeStyle = col; g.globalAlpha = 0.75; g.shadowColor = col; g.shadowBlur = 10 * dpr;",
"    g.beginPath();",
"    for (const [a, b] of HAND_EDGES) { g.moveTo(P[a][0], P[a][1]); g.lineTo(P[b][0], P[b][1]); }",
"    g.stroke();",
"    g.fillStyle = '#fff'; g.globalAlpha = 0.9;",
"    for (const p of P) { g.beginPath(); g.arc(p[0], p[1], 2.6 * dpr, 0, Math.PI * 2); g.fill(); }",
"    return P;",
"  }",
"  onResult(d) {",
"      const m = { ...d, def: CATALOG[d.index] };",
"  }",
"  buildUI() {",
"      b.textContent = `${c} · ${CATALOG.filter((d) => d.category === c).length}`; b.dataset.cat = c;",
"      b.innerHTML = `<i style=\"color:${rgbCss(d.color)};background:${rgbCss(d.color)}\"></i>${d.name}`;",
"  }",
"  updateHud() {",
"      $('cat').textContent = def.category; $('name').textContent = def.name; $('fact').textContent = def.fact || '';",
"      $('bigTitle').querySelector('.t').textContent = def.name; $('bigTitle').querySelector('.s').textContent = def.fact || '';",
"    if (pill.dataset.state !== st.state) { pill.dataset.state = st.state; pill.textContent = st.state; }",
"  }",
"  toast(msg) {",
"    const el = this.$('toast');",
"    el.textContent = msg; el.classList.add('show');",
"  }",
"  guideItems(machine) {",
"    return [",
"      ['snap', '🫰', '<b>Snap</b> — summon particles / dissolve'],",
"      ['fist', '✊', machine ? '<b>Fist</b> — put it together' : '<b>Fist</b> — form the wonder'],",
"      ['open', '✋', machine ? '<b>Open slowly</b> — explode it, see inside' : '<b>Open hand</b> — morph to the next wonder'],",
"      ['twist', '🔄', '<b>Twist / raise hand</b> — rotate & tilt it'],",
"      ...(machine ? [['point', '☝', '<b>Point</b> at a part to learn it · <b>pinch</b> 🤏 pulls it out']] : []),",
"      ['zoom', '🙌', '<b>Two hands</b> apart / together — zoom'],",
"      ['peace', '✌', '<b>Peace</b> — jump to the next model'],",
"    ];",
"  }",
"  updatePicking(t, pointing, active) {",
"    if (ctl.pinchStart) {",
"      ctl.pinchStart = false;",
"      if (this.sel >= 0) { this.pulled = !this.pulled; this.toast(this.pulled ? `🤏 Pulled out: ${this.model.labels[this.sel].label}` : '🤏 Put back'); }",
"    }",
"  }",
"  computeAnchors() {",
"      if (li === this.sel) w[2] += 0.5 * this.pullAmt;",
"  }",
"  movePull() {",
"    this.pullAmt += ((this.pulled && this.sel >= 0 ? 1 : 0) - this.pullAmt) * (1 - Math.exp(-dt * 6));",
"  }",
"  step() { pull: [0, 0, 0.5 * this.pullAmt]; }",
"  constructor() {",
"    this.zoom = 1; this.zoomTarget = 1; this.zoomGrab = null;",
"    this.sel = -1; this.pulled = false; this.pullAmt = 0; this.hover = { li: -1, t0: 0 };",
"        this.manualExplode = this.quiz ? 1 : 0; this.sel = -1; this.pulled = false; this.zoomTarget = 1; this.prefetch();",
"    this.manualExplode = this.quiz ? 1 : 0; this.sel = -1; this.pulled = false; this.zoomTarget = 1; this.prefetch();",
"  }",
"  frame() {",
"    if (twoHands) {",
"      const a = ctl.landmarks[9], b = ctl.second[9], spread = Math.hypot((a[0] - b[0]) * ctl.aspect, a[1] - b[1]);",
"      if (!this.zoomGrab) this.zoomGrab = { spread: Math.max(spread, 0.02), zoom: this.zoomTarget };",
"      this.zoomTarget = clamp((this.zoomGrab.zoom * spread) / this.zoomGrab.spread, 0.5, 2.6);",
"    } else this.zoomGrab = null;",
"    const twoHands = vis && ctl.secondVisible(t) && formed;",
"    const kick = st.consumeKick() ? 1 : 0;                                // one-frame impulse, read exactly once",
"  }",
"  drawOverlay(t, machine, formT, pointing) {",
"    if (this.pointer) {",
"      const { x, y, li, prog } = this.pointer;",
"      g.strokeStyle = '#7dff9b'; g.lineWidth = 2 * dpr; g.globalAlpha = 0.9;",
"      g.beginPath(); g.arc(x, y, 14 * dpr, 0, Math.PI * 2); g.stroke();",
"      if (li >= 0) {",
"        g.lineWidth = 4 * dpr; g.beginPath(); g.arc(x, y, 20 * dpr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog); g.stroke();",
"      }",
"    }",
"    if (!this.anchors.length) return;",
"  }",
"  fps() { if (t - this._fpsT >= 1) { this.fps = this._fpsN / (t - this._fpsT); this._fpsN = 0; this._fpsT = t; } }",
"}",
].join('\n');

test('WonderSnap upgrade patches all reviewed interaction anchors and Vietnamese UI', () => {
  const patched = patchWonderSnapApp(fixtureApp, { fpsPatch: 'REPORT_METRICS()' });
  assert.match(patched, /Palm triangulation/);
  assert.match(patched, /twoHandGrab/);
  assert.match(patched, /Xung lực năng lượng/);
  assert.match(patched, /Khiên năng lượng đã kích hoạt/);
  assert.match(patched, /isThumbsUp/);
  assert.match(patched, /this\.pullVec\.map/);
  assert.match(patched, /viCategory\(c\)/);
  assert.match(patched, /viModel\(d\.name\)/);
  assert.match(patched, /Chụm ngón/);
  assert.match(patched, /REPORT_METRICS\(\)/);
  assert.doesNotMatch(patched, /0\.5, 2\.6/);
  assert.doesNotThrow(() => new Function(patched), 'Patched upstream JavaScript must remain syntactically valid');
});


test('WonderSnap recognizes thumbs-up as its own inert pose for the holographic shield', () => {
  const source = [
    "export const OPEN = 'open', FIST = 'fist', PEACE = 'peace', POINT = 'point', OTHER = 'other', NONE = 'none';",
    '  if (ext.every(Boolean) && thumbOut) return OPEN;',
    '  if (curled.every(Boolean)) return FIST;',
  ].join('\n');
  const patched = patchWonderSnapGestures(source);
  assert.match(patched, /THUMBS_UP = 'thumbs-up'/);
  assert.match(patched, /thumbRaised && curled.every\(Boolean\)/);
  assert.match(patched, /return THUMBS_UP/);
  assert.doesNotThrow(() => new Function(patched.replace('export const', 'const')));
});

test('WonderSnap HTML is switched to Vietnamese and advertises upgraded gesture controls', () => {
  const html = localizeWonderSnapHtml('<html lang="en"><head><title>WonderSnap</title></head><body><label>Gesture sensitivity</label><h2>Controls</h2><p>Twist your hand to turn the model, raise or lower it to tilt; two hands zoom.</p></body></html>');
  assert.match(html, /lang="vi"/);
  assert.match(html, /Độ nhạy cử chỉ/);
  assert.match(html, /Điều khiển/);
  assert.match(html, /xoay mô hình/);
});

test('WonderSnap voice recognizes Vietnamese and uses Vietnamese speech output', () => {
  const source = [
    '// Voice control (Web Speech API), spoken part descriptions, session recording (MediaRecorder) and the',
    '// command parser that turns a sentence into app actions. Kept free of app state so it is easy to test.',
    "const words = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\\s+/).filter(Boolean);",
    "export function parseCommand(text) { const t = ` ${words(text).join(' ')} `, has = (...ws) => ws.some((w) => t.includes(` ${w} `)); return []; }",
    "rec.lang = 'en-US'; u.rate = 1.02; u.pitch = 1.0;",
  ].join('\n');
  const localized = localizeWonderSnapFeatures(source);
  assert.match(localized, /viVoice\(text\)/);
  assert.match(localized, /rec\.lang = 'vi-VN'/);
  assert.match(localized, /u\.lang = 'vi-VN'/);
});

test('vendor script documents and wires the interaction upgrade into the pinned build', () => {
  const script = read('scripts/vendor-wondersnap.mjs');
  assert.match(script, /patchWonderSnapApp/);
  assert.match(script, /localizeWonderSnapHtml/);
  assert.match(script, /localizeWonderSnapFeatures/);
  assert.match(script, /patchWonderSnapGestures/);
  for (const image of ['docs/designs/design-01-ban-tay-hologram.png','docs/designs/design-02-chon-tach-linh-kien.png','docs/designs/design-03-gauntlet-vi-dieu-khien.png']) assert.ok(fs.existsSync(new URL(`../${image}`, import.meta.url)), `missing design ${image}`);
  assert.match(script, /localized interaction upgrade/);
});
