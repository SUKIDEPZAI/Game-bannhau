// Gán detection → slot (thuần, không DOM → test được). Chi phí = khoảng cách tới vị trí DỰ ĐOÁN theo thời gian thực trôi qua,
// chuẩn hoá theo kích thước tay, có GATING. Xét mọi phép gán (tối đa 2×2 → brute force = tối ưu, không cần Hungarian).
export function assignCost(H, o, st, aspect, tc, T) {
  const lost = (tc - st.last) / 1000;
  if (!st.has || lost * 1000 > T.lostResetMs) return T.emptyCost;
  const sc = Math.max(st.scale, 0.05), tp = Math.min(0.15, Math.max(0, lost));
  const px = st.x[0] + st.pv[0] * tp, py = st.x[1] + st.pv[1] * tp;
  const c = Math.hypot((H[o] - px) * aspect, H[o + 1] - py) / sc;
  return c > T.assignGate ? T.emptyCost + 1 : c;              // vượt cổng → kém hơn cả slot trống (không cướp danh tính)
}
// dets: mảng offset trong H (63 float/tay) · sets: [SmoothSet, SmoothSet] → mảng slot cho từng detection
export function pickAssignment(dets, H, sets, aspect, tc, T) {
  const c = (d, s) => assignCost(H, dets[d], sets[s], aspect, tc, T);
  if (dets.length === 1) return [c(0, 0) <= c(0, 1) ? 0 : 1];
  if (dets.length >= 2) return c(0, 0) + c(1, 1) <= c(0, 1) + c(1, 0) ? [0, 1] : [1, 0];
  return [];
}
