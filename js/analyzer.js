// Từ landmark → góc khớp, nhận diện động tác, đếm rep, phản hồi form.
import { L, ok, mid, angles } from "./angleUtils.js";
import { feedback } from "./formChecker.js";

export function analyse(t, now, onRep) {
  const m = t.lm, a = t.ang = angles(m);
  const sh = mid(m[L.ls], m[L.rs]), hp = mid(m[L.lh], m[L.rh]);
  const legs = ok(m[L.lk]) && ok(m[L.rk]) && ok(m[L.la]) && ok(m[L.ra]);
  const horiz = Math.abs(hp.x - sh.x) > Math.abs(hp.y - sh.y) * 1.35;
  const knee = (a.lk + a.rk) / 2;
  const arms = [];
  if (ok(m[L.lw]) && ok(m[L.le])) arms.push(a.le);
  if (ok(m[L.rw]) && ok(m[L.re])) arms.push(a.re);

  const rel = [];                                    // cổ tay − vai (âm = cao hơn vai)
  if (ok(m[L.lw])) rel.push(m[L.lw].y - m[L.ls].y);
  if (ok(m[L.rw])) rel.push(m[L.rw].y - m[L.rs].y);
  const wrist = rel.length ? Math.min(...rel) : 1;

  const feed = (kind, r) => {
    if (!r) return;
    const f = feedback(kind, r.good);
    Object.assign(t, { fb: f.text, fbUntil: now + 2500, warnUntil: f.warn ? now + 900 : t.warnUntil });
    onRep();
  };
  if (legs) feed("squat", t.reps.squat.update(knee, now));
  if (horiz && arms.length) feed("push", t.reps.push.update(arms.reduce((s, v) => s + v, 0) / arms.length, now));
  else if (!horiz) t.reps.push.phase = "up";
  feed("raise", t.reps.raise.update(wrist, now));

  // Nhãn động tác, giữ ổn định 3 frame để không nhấp nháy.
  const next = horiz && arms.length && arms.some((v) => v < 140) ? "Chống đẩy"
    : legs && knee < 125 && hp.y > sh.y + 0.10 ? "Squat"
    : wrist < -0.10 ? "Giơ tay" : "Đứng";
  if (next === t.cand) t.candN++; else { t.cand = next; t.candN = 1; }
  if (t.candN >= 3) t.action = t.cand;
}
