// HUD: tạo thẻ 1 lần cho mỗi người rồi chỉ cập nhật text → không rebuild DOM mỗi frame.
import { COLORS } from "./renderer.js";

export class Cards {
  constructor(root) { this.root = root; this.map = new Map(); }
  update(list, now) {
    const alive = new Set();
    for (const t of list) {
      alive.add(t.id);
      let c = this.map.get(t.id);
      if (!c) { c = this.make(t); this.map.set(t.id, c); this.root.appendChild(c.el); }
      const a = t.ang, col = COLORS[(t.id - 1) % COLORS.length], warn = t.warnUntil > now;
      c.act.textContent = `${t.action} · track ${Math.round(t.quality * 100)}%`;
      c.reps.textContent = `Squat ${t.reps.squat.count} · Đẩy ${t.reps.push.count} · Giơ tay ${t.reps.raise.count}`;
      c.fb.textContent = t.fbUntil > now ? t.fb : ""; c.fb.style.color = warn ? "#ffb020" : "#9fffd8";
      c.bar.style.width = Math.round(t.quality * 100) + "%"; c.bar.style.background = col;
      [a.le, a.re, a.lk, a.rk].forEach((v, i) => (c.ang[i].textContent = Math.round(v) + "°"));
    }
    for (const [id, c] of this.map) if (!alive.has(id)) { c.el.remove(); this.map.delete(id); }
  }
  make(t) {
    const el = document.createElement("div"); el.className = "card";
    el.innerHTML = `<div class="row"><b style="color:${COLORS[(t.id - 1) % COLORS.length]}">ID ${t.id}</b><span class="act"></span></div>
      <div class="bar"><i></i></div><div class="meta reps"></div><div class="meta fb"></div>
      <div class="angles">${["T.E", "T.P", "C.E", "C.P"].map((n) => `<div><b>0°</b><span>${n}</span></div>`).join("")}</div>`;
    return { el, act: el.querySelector(".act"), bar: el.querySelector(".bar i"), reps: el.querySelector(".reps"),
      fb: el.querySelector(".fb"), ang: [...el.querySelectorAll(".angles b")] };
  }
}
