import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const script = read('scripts/vendor-wondersnap.mjs');
const main = read('public/js/main.js');

test('WonderSnap upgrade replaces the old hand dots with a holographic mesh and joint HUD', () => {
  const patcher = read('scripts/wondersnap-upgrade.mjs');
  assert.match(script, /patchWonderSnapApp/);
  assert.match(script, /localized interaction upgrade/);
  assert.match(patcher, /Palm triangulation/);
  assert.match(patcher, /Concentric joint reticles/);
  assert.match(patcher, /holographic pointer reticle/);
  assert.match(patcher, /two-hand zoom and rotation/);
  assert.match(patcher, /pinch-select and hand-following part pull/);
  assert.match(patcher, /repulsor open-palm thrust detector/);
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
