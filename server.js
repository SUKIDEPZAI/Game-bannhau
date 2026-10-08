// Server tĩnh cho Render (Free Web Service): nén Brotli/gzip, cache dài cho wasm/model, /healthz,
// và TỰ PING chính mình mỗi 60 giây để Render không cho ngủ (spin down) khi rảnh.
import express from "express";
import compression from "compression";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const app = express();
app.disable("x-powered-by");
app.use(compression());

app.get("/healthz", (_q, r) => r.set("Cache-Control", "no-store").json({ ok: true, uptime: Math.round(process.uptime()), t: Date.now() }));

// WASM + bundle MediaPipe lấy từ npm (cùng domain, cache 1 năm)
app.use("/vendor", express.static(path.join(dir, "node_modules/@mediapipe/tasks-vision"), { maxAge: "365d", immutable: true }));

// Model .task: tải 1 lần từ Google rồi lưu đĩa, sau đó phục vụ trực tiếp từ server
const GS = "https://storage.googleapis.com/mediapipe-models";
const MODELS = {
  "hand_landmarker.task": `${GS}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
  "face_landmarker.task": `${GS}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`
};
const cache = path.join(process.env.TMPDIR || "/tmp", "mp-models");
fs.mkdirSync(cache, { recursive: true });
app.get("/models/:f", async (req, res) => {
  const url = MODELS[req.params.f]; if (!url) return res.sendStatus(404);
  const file = path.join(cache, req.params.f);
  try {
    if (!fs.existsSync(file)) {
      const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}`);
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    }
    res.set("Cache-Control", "public,max-age=31536000,immutable").type("application/octet-stream").sendFile(file);
  } catch (e) { console.error("model lỗi", e.message); res.status(502).send("model fetch failed"); }
});

app.use(express.static(path.join(dir, "public"), { maxAge: "5m" }));
app.listen(PORT, () => console.log(`Pose app chạy ở cổng ${PORT}`));

// Keep-alive: gọi vào chính URL công khai (đi qua mạng Render) mỗi phút.
const self = process.env.KEEPALIVE_URL || process.env.RENDER_EXTERNAL_URL;
const every = Number(process.env.KEEPALIVE_MS) || 60_000;
if (self) {
  setInterval(() => {
    fetch(`${self}/healthz`, { signal: AbortSignal.timeout(10_000) })
      .then((r) => console.log(`[keep-alive] ${r.status} ${new Date().toISOString()}`))
      .catch((e) => console.warn("[keep-alive] lỗi:", e.message));
  }, every);
  console.log(`[keep-alive] bật: ${self}/healthz mỗi ${every / 1000}s`);
}
