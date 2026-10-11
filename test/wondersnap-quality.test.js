import test from 'node:test';
import assert from 'node:assert/strict';
import { wonderQualityTier } from '../public/js/wondersnap-quality.js';

test('WonderSnap prefers conservative particle/DPR settings on touch or unknown hardware', () => {
  assert.deepEqual(wonderQualityTier({ coarse: true, hardwareConcurrency: 8, deviceMemory: 8, devicePixelRatio: 3 }), {
    tier: 'mobile-safe', particles: 35000, dpr: 1, trails: 0,
  });
  assert.equal(wonderQualityTier({}).particles, 35000);
});

test('WonderSnap chooses bounded middle tier for capable but non-high-end desktops', () => {
  assert.deepEqual(wonderQualityTier({ width: 1200, hardwareConcurrency: 6, deviceMemory: 6, devicePixelRatio: 2 }), {
    tier: 'desktop-balanced', particles: 65000, dpr: 1.1, trails: 0,
  });
});

test('WonderSnap high tier caps DPR and retains all models while increasing particles', () => {
  assert.deepEqual(wonderQualityTier({ width: 1400, hardwareConcurrency: 12, deviceMemory: 16, devicePixelRatio: 3 }), {
    tier: 'desktop-high', particles: 110000, dpr: 1.25, trails: 0,
  });
});
