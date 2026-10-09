// Ghi lệnh vẽ của renderer.js ra JSON để dựng ảnh xem trước (test/preview.py).
import { Renderer } from "../public/js/renderer.js";
import { writeFileSync } from "node:fs";
function pose({ ext = [1, 1, 1, 1], thumb = 1 } = {}) {
  const L = Array.from({ length: 21 }, () => ({ x: 0, y: 0 })), W = { x: .5, y: .82 }, mcp = [[-.05, -.12], [-.005, -.13], [.04, -.12], [.082, -.10]];
  L[0] = W; [5, 9, 13, 17].forEach((id, f) => { const b = { x: W.x + mcp[f][0], y: W.y + mcp[f][1] }; L[id] = b; const len = [.085, .095, .088, .07][f];
    if (ext[f]) { L[id + 1] = { x: b.x, y: b.y - len * .5 }; L[id + 2] = { x: b.x, y: b.y - len * .78 }; L[id + 3] = { x: b.x, y: b.y - len }; }
    else { L[id + 1] = { x: b.x, y: b.y - .05 }; L[id + 2] = { x: b.x + .004, y: b.y - .012 }; L[id + 3] = { x: b.x + .006, y: b.y + .022 }; } });
  L[1] = { x: .46, y: .78 }; L[2] = { x: .425, y: .72 };
  if (thumb) { L[3] = { x: .395, y: .665 }; L[4] = { x: .37, y: .62 }; } else { L[3] = { x: .45, y: .70 }; L[4] = { x: .48, y: .71 }; }
  return L;
}
const out = {};
for (const [name, p, ui, style] of [["xuong_xoe", pose(), null, 0], ["xuong_chitay_hover", pose({ ext: [1, 0, 0, 0], thumb: 0 }), { hov: [0, 1, 0, 0, 0], prog: [0, .6, 0, 0, 0] }, 0], ["neon", pose(), null, 1], ["wire", pose(), null, 2]]) {
  const cmds = []; let st = { fill: "#000", stroke: "#000", w: 1, a: 1 };
  const ctx = new Proxy({}, { get: (t, k) => k === "measureText" ? () => ({ width: 40 }) : k === "save" || k === "restore" ? () => {} : (k in t ? t[k] : (...a) => { cmds.push([k, a, { f: ctx.fillStyle, s: ctx.strokeStyle, w: ctx.lineWidth, a: ctx.globalAlpha }]); }), set: (t, k, v) => (t[k] = v, true) });
  ctx.globalAlpha = 1; ctx.lineWidth = 1;
  const r = new Renderer({ width: 640, height: 640, getContext: () => ctx }); r.style = style; r.mirrored = false; r.fx = { glow: true, trail: false, text: true, lasers: false };
  const d = new Float32Array(42); p.forEach((q, i) => { d[i * 2] = q.x; d[i * 2 + 1] = q.y; });
  const conn = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]].map(([start, end]) => ({ start, end }));
  r.hand({ d, alpha: 1, ui: ui ? { hov: Uint8Array.from(ui.hov), prog: Float32Array.from(ui.prog), flash: -1e9 } : null }, conn, "Chỉ tay", 1000);
  out[name] = cmds;
}
writeFileSync("/home/claude/preview.json", JSON.stringify(out));
