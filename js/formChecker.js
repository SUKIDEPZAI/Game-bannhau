// Luật phản hồi form theo từng bài (kiểu FormChecker / kinkDetector).
const MSG = {
  squat: ["Squat chuẩn ✓", "Squat chưa đủ sâu — hạ thấp hơn"],
  push:  ["Chống đẩy chuẩn ✓", "Chống đẩy chưa đủ sâu"],
  raise: ["Giơ tay ✓", "Giơ tay cao hơn"]
};
export const feedback = (kind, good) => ({ text: MSG[kind][good ? 0 : 1], warn: !good });
