// Cheap pre-run quality preset for WonderSnap's GPU particle field.
// Hardware hints are best-effort; they are not reliable benchmarks or latency guarantees.
export function wonderQualityTier({
  coarse = false,
  maxTouchPoints = 0,
  width = 1024,
  hardwareConcurrency = 4,
  deviceMemory = 4,
  devicePixelRatio = 1,
} = {}) {
  const touchDevice = Boolean(coarse) || Number(maxTouchPoints) > 0 || Number(width) <= 760;
  const cores = Number(hardwareConcurrency) || 4;
  const memory = Number(deviceMemory) || 4;
  const dpr = Number(devicePixelRatio) > 0 ? Number(devicePixelRatio) : 1;

  if (touchDevice || cores < 6 || memory < 6) return { tier: 'mobile-safe', particles: 35000, dpr: 1, trails: 0 };
  if (cores >= 8 && memory >= 8) return { tier: 'desktop-high', particles: 110000, dpr: Math.min(dpr, 1.25), trails: 0 };
  return { tier: 'desktop-balanced', particles: 65000, dpr: Math.min(dpr, 1.1), trails: 0 };
}
