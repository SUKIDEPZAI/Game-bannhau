// Mỗi kịch bản chạy trong 1 process riêng (module main.js có trạng thái toàn cục).
import { spawnSync } from "node:child_process";
const cases = { "bình thường": {}, "presentedFrames=undefined": { noPresented: true }, "AI chậm 250ms (CPU delegate)": { aiMs: 250 }, "AI 60ms": { aiMs: 60 }, "ping OK + worker#0 lỗi (Render thiếu /vendor)": { pingOk: true, workerFailFirst: true }, "cam 30fps": { camFps: 30 }, "tay đứng yên trên nút (hover)": { still: true } };
let bad = 0;
for (const [n, o] of Object.entries(cases)) {
  const p = spawnSync("node", ["-e", `import("./test/e2e.js").then(async m=>{const r=await m.e2e(${JSON.stringify({ ...o, secs: 3 })});r.tele=undefined;console.log("@@"+JSON.stringify(r));process.exit(0)})`], { encoding: "utf8", timeout: 25000 });
  const line = p.stdout.split("\n").find((l) => l.startsWith("@@")); const r = line ? JSON.parse(line.slice(2)) : { arcs: 0, errors: [p.stderr.slice(0, 200)], fps: "?", hands: "?", model: "?", workers: "?", errBanner: "" };
  const want = Math.min(55, 1000 / (o.aiMs || 8) * 0.6, (o.camFps || 60) * 0.8); const ok = r.dtOk && r.arcs > 500 && !r.errors.length && String(r.hands) === "1" && r.aiFps >= want && r.level === "0"; if (!ok) bad++;
  if (o.still && !r.hover) bad++, console.log("FAIL hover không bật");
  console.log(`${ok ? "OK  " : "FAIL"} ${n.padEnd(46)} dtOk=${r.dtOk} arcs=${String(r.arcs).padStart(5)} fps=${r.fps} tay=${r.hands} model=${r.model} aiFps=${r.aiFps} lv=${r.level} workers=${r.workers} lỗi=${r.errors.join("|") || "-"}`);
}
process.exit(bad ? 1 : 0);
