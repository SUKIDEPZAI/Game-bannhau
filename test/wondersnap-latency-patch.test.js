import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const script = read('scripts/vendor-wondersnap.mjs');
const main = read('public/js/main.js');

test('WonderSnap vendor patch removes decorative dots and fingertip rings, not interaction', () => {
  assert.match(script, /landmark-dot drawing changed upstream/);
  assert.match(script, /fingertip cursor drawing changed upstream/);
  assert.match(script, /pointer\/dwell interaction stays active/);
  assert.match(script, /Gesture logic,.*pointer coordinates, dwell timers, hit-testing and pinch actions remain untouched/s);
});

test('embedded WonderSnap retains upstream camera request instead of unmeasured overrides', () => {
  assert.match(script, /ideal: 1280/);
  assert.match(script, /ideal: 720/);
  assert.match(script, /do not rewrite the upstream camera request/);
  assert.doesNotMatch(script, /handSource = handSource\.replace/);
  assert.doesNotMatch(script, /ideal: 640|ideal: 480|max: 30/);
});

test('WONDER uses upstream particle, DPR and trail defaults for parity with direct route', () => {
  assert.match(main, /new URLSearchParams\(\{ autostart: "camera" \}\)/);
  assert.doesNotMatch(main, /wonderQualityTier|deviceMemory|hardwareConcurrency/);
  assert.doesNotMatch(main, /n: String\(|dpr: String\(|trails: String\(/);
});
