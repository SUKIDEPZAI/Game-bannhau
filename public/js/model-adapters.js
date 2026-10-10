// Pure adapter functions kept separate so landmark contract changes can be unit-tested without a GPU.
export function packMicroHands(results, maxHands = 2) {
  const hands = (Array.isArray(results) ? results : []).filter(h => Array.isArray(h?.landmarks) && h.landmarks.length >= 21).slice(0, maxHands);
  const out = new Float32Array(hands.length * 63);
  hands.forEach((hand, h) => {
    for (let i = 0; i < 21; i++) {
      const p = hand.landmarks[i] || {};
      out[h * 63 + i * 3] = Number.isFinite(p.x) ? p.x : Number.isFinite(p[0]) ? p[0] : 0;
      out[h * 63 + i * 3 + 1] = Number.isFinite(p.y) ? p.y : Number.isFinite(p[1]) ? p[1] : 0;
      out[h * 63 + i * 3 + 2] = Number.isFinite(p.z) ? p.z : Number.isFinite(p[2]) ? p[2] : 0;
    }
  });
  return { hands: out, count: hands.length };
}
export function quantile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const s = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  return s[Math.min(s.length - 1, Math.max(0, Math.round(Math.min(1, Math.max(0, p)) * (s.length - 1))))];
}
