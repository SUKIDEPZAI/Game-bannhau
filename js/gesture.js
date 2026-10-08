// Nhận diện cử chỉ từ 21 điểm bàn tay (đã nhân tỉ lệ khung hình để khoảng cách không méo).
export function gesture(set, aspect) {
  const p = (i) => ({ x: set.x[i * 2] * aspect, y: set.x[i * 2 + 1] });
  const d = (i, j) => Math.hypot(p(i).x - p(j).x, p(i).y - p(j).y);
  const size = d(0, 9) || 1;
  const ext = [[8, 6], [12, 10], [16, 14], [20, 18]].map(([t, j]) => d(t, 0) > d(j, 0) * 1.15);
  const thumb = d(4, 17) > d(3, 17) * 1.08 && d(4, 5) > size * 0.45;
  const n = ext.filter(Boolean).length;
  if (d(4, 8) < size * 0.28 && (ext[1] || ext[2])) return "Pinch";
  if (n === 4) return thumb ? "Mở bàn tay" : "4 ngón";
  if (n === 0) return thumb ? "Like" : "Nắm đấm";
  if (n === 1 && ext[0]) return "Chỉ tay";
  if (n === 2 && ext[0] && ext[1]) return "Chữ V";
  if (n === 3 && !ext[0]) return "OK";
  return `${n + (thumb ? 1 : 0)} ngón`;
}
