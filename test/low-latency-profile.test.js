import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('TURBO is the default low-latency profile and keeps gesture rendering without costly effects', () => {
  const cfg = read('public/js/config.js');
  assert.match(cfg, /TURBO:\s*\{ cam: \[480, 270, 60\]/);
  assert.match(cfg, /export const DEFAULT_PROFILE = "TURBO"/);
  assert.match(cfg, /export const INFERENCE_FRAME = \{ width: 384, height: 216/);
  assert.match(cfg, /staleMs: 100/);
  assert.match(cfg, /glow: false, trail: false, text: false, lasers: false/);
});

test('profile cycling adapts to the profile count instead of hard-coding three choices', () => {
  assert.match(read('public/js/main.js'), /Object\.keys\(PROFILES\)\.indexOf\(pname\) \+ 1\) % Object\.keys\(PROFILES\)\.length/);
});
