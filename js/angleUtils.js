// Hình học + chỉ số landmark MediaPipe (giống angleUtils trong FormFlow).
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const ok = (p) => !!p && (p.visibility == null || p.visibility > 0.35);
export const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const L = { nose:0, ls:11, rs:12, le:13, re:14, lw:15, rw:16, lh:23, rh:24, lk:25, rk:26, la:27, ra:28 };

export const BONES = [
  [11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],
  [23,25],[25,27],[27,29],[27,31],[29,31],[24,26],[26,28],[28,30],[28,32],[30,32],
  [0,11],[0,12],[0,2],[0,5],[2,7],[5,8]
];

export function angle(a, b, c) {
  const x1 = a.x - b.x, y1 = a.y - b.y, x2 = c.x - b.x, y2 = c.y - b.y;
  const d = Math.hypot(x1, y1) * Math.hypot(x2, y2);
  return d ? Math.acos(clamp((x1 * x2 + y1 * y2) / d, -1, 1)) * 57.29578 : 0;
}

export const angles = (m) => ({
  le: angle(m[L.ls], m[L.le], m[L.lw]), re: angle(m[L.rs], m[L.re], m[L.rw]),
  lk: angle(m[L.lh], m[L.lk], m[L.la]), rk: angle(m[L.rh], m[L.rk], m[L.ra])
});
