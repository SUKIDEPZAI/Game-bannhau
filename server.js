// Skeleton v18: static app + model cache + PostgreSQL API; jobs run in a separate Render worker.
import express from "express";
import compression from "compression";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const VERSION = "19.0.0";
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(compression());
app.use(express.json({ limit: "32kb" }));
app.use((_q, res, next) => {
  const origin = _q.headers.origin; const allowed = (process.env.ALLOWED_ORIGIN || "*").split(",").map(x => x.trim());
  if (!origin || allowed.includes("*") || allowed.includes(origin)) res.set("Access-Control-Allow-Origin", allowed.includes("*") ? "*" : origin);
  res.set({ "Vary": "Origin", "Cross-Origin-Resource-Policy": "cross-origin", "Timing-Allow-Origin": "*", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "Permissions-Policy": "camera=(self), microphone=(), geolocation=()", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization" });
  if (_q.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const alive = (_q, res) => res.set("Cache-Control", "no-store").json({ ok: true, version: VERSION, uptime: Math.round(process.uptime()), t: Date.now() });
app.get("/ping", alive);
app.get("/healthz", async (_q, res) => {
  let db = !pool ? "disabled" : dbReady ? "ready" : "starting";
  if (pool && dbReady) { try { await pool.query("SELECT 1"); } catch { db = "error"; } }
  const ok = db !== "error" && db !== "starting";
  res.set("Cache-Control", "no-store").status(ok ? 200 : 503).json({ ok, database: db, version: VERSION });
});
app.get("/version.json", (_q, res) => res.set("Cache-Control", "no-store").json({ version: VERSION, build: process.env.RENDER_GIT_COMMIT || "local", updatedAt: "2026-10-10" }));

app.use("/vendor", express.static(path.join(dir, "node_modules/@mediapipe/tasks-vision"), { maxAge: "365d", immutable: true, setHeaders: (res, p) => { if (p.endsWith(".cjs")) res.type("application/javascript"); } }));
// WonderSnap is an isolated, upstream-vendored 3D particle experience. Its local model and JS assets are served separately from Skeleton APIs.
app.use("/wondersnap/node_modules", express.static(path.join(dir, "node_modules"), { maxAge: "365d", immutable: true }));
app.use("/wondersnap", express.static(path.join(dir, "wondersnap"), { maxAge: 0, setHeaders: (res, file) => { if (/\.(html|js|css)$/.test(file)) res.set("Cache-Control", "no-store, max-age=0, must-revalidate"); } }));
app.get("/wondersnap", (_q, res) => res.redirect(302, "/wondersnap/"));
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
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer())); fs.renameSync(tmp, file);
    }
    res.set("Cache-Control", "public,max-age=31536000,immutable").type("application/octet-stream").sendFile(file);
  } catch (e) { console.error("model fetch failed:", e.message); res.status(502).send("model fetch failed"); }
});

// PostgreSQL is optional locally. Never put database calls in the per-camera-frame loop.
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }, max: 4, idleTimeoutMillis: 10000, connectionTimeoutMillis: 3000 }) : null;
let dbReady = false;
async function initDb() {
  if (!pool) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS skeleton_jobs (
    id BIGSERIAL PRIMARY KEY, kind TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
    attempts INTEGER NOT NULL DEFAULT 0, result JSONB, error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS skeleton_jobs_queue_idx ON skeleton_jobs(status, created_at)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS skeleton_sessions (
    id BIGSERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    client_tag TEXT, metrics JSONB NOT NULL DEFAULT '{}'::jsonb
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS skeleton_sessions_created_idx ON skeleton_sessions(created_at DESC)`);
  dbReady = true;
}
const requireAdmin = (req, res, next) => {
  if (!process.env.ADMIN_TOKEN) return res.status(503).json({ error: "ADMIN_TOKEN is not configured" });
  if (req.get("authorization") !== `Bearer ${process.env.ADMIN_TOKEN}`) return res.status(401).json({ error: "unauthorized" });
  next();
};
app.get("/api/status", async (_q, res) => {
  let database = !pool ? "disabled" : dbReady ? "ready" : "starting", queuedJobs = null, failedJobs = null;
  if (pool && dbReady) { try { const q = await pool.query("SELECT count(*) FILTER (WHERE status='queued')::int AS queued, count(*) FILTER (WHERE status='failed')::int AS failed FROM skeleton_jobs"); queuedJobs = q.rows[0].queued; failedJobs = q.rows[0].failed; } catch { database = "error"; } }
  res.set("Cache-Control", "no-store").json({ version: VERSION, database, queuedJobs, failedJobs, features: ["latest-frame-wins", "worker-inference", "model-ab-benchmark", "specialist-agents", "postgres-jobs-worker", "wondersnap-webgl2-particle-mode"] });
});
const metricsRate = new Map();
function rateMetrics(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || "unknown", now = Date.now(), windowMs = 60000, max = 20;
  const hit = metricsRate.get(key);
  if (!hit || now - hit.start >= windowMs) metricsRate.set(key, { start: now, count: 1 });
  else if (++hit.count > max) return res.status(429).json({ error: "rate limit exceeded" });
  // Bound in-memory bookkeeping for small single-instance deployments.
  if (metricsRate.size > 1000) for (const [k,v] of metricsRate) if (now - v.start > windowMs * 2) metricsRate.delete(k);
  next();
}
app.post("/api/sessions/metrics", rateMetrics, async (req, res) => {
  // Store coarse session summaries only; never stream landmarks or images to the server.
  if (!pool || !dbReady) return res.status(503).json({ error: "database unavailable" });
  const m = req.body?.metrics;
  if (!m || typeof m !== "object" || Array.isArray(m)) return res.status(400).json({ error: "metrics object required" });
  const safe = {};
  const numericKeys = ["aiP50", "aiP95", "ageP95", "renderP95", "cameraFps", "aiFps", "displayFps", "dropped", "stale"];
  for (const k of numericKeys) {
    const v = m[k];
    if (typeof v === "number" && Number.isFinite(v)) safe[k] = Math.max(0, Math.min(1e6, v));
  }
  for (const k of ["delegate", "profile"]) if (typeof m[k] === "string") safe[k] = m[k].slice(0, 48);
  const tag = typeof req.body.clientTag === "string" ? req.body.clientTag.slice(0, 64) : null;
  try { const r = await pool.query("INSERT INTO skeleton_sessions(client_tag,metrics) VALUES($1,$2) RETURNING id,created_at", [tag, safe]); res.status(201).json(r.rows[0]); }
  catch (e) { console.error("metrics persist failed", e.message); res.status(503).json({ error: "persistence unavailable" }); }
});
app.post("/api/jobs", requireAdmin, async (req, res) => {
  if (!pool || !dbReady) return res.status(503).json({ error: "database unavailable" });
  const kind = req.body?.kind;
  const payload = req.body?.payload ?? {};
  if (!['cleanup_metrics', 'rebuild_stats', 'health_check'].includes(kind)) return res.status(400).json({ error: "unsupported job kind" });
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return res.status(400).json({ error: "payload must be an object" });
  try { const r = await pool.query("INSERT INTO skeleton_jobs(kind,payload) VALUES($1,$2) RETURNING id,kind,status,created_at", [kind, payload]); res.status(202).json(r.rows[0]); }
  catch (e) { console.error("job enqueue failed", e.message); res.status(503).json({ error: "queue unavailable" }); }
});
app.get("/api/jobs/:id", requireAdmin, async (req, res) => {
  if (!pool || !dbReady) return res.status(503).json({ error: "database unavailable" });
  if (!/^\d{1,18}$/.test(req.params.id)) return res.status(400).json({ error: "invalid job id" });
  try {
    const r = await pool.query("SELECT id,kind,status,attempts,result,error,created_at,updated_at FROM skeleton_jobs WHERE id=$1", [req.params.id]);
    if (!r.rowCount) return res.sendStatus(404);
    res.set("Cache-Control", "no-store").json(r.rows[0]);
  } catch (e) { console.error("job lookup failed:", e.message); res.status(503).json({ error: "job lookup unavailable" }); }
});

async function runJob(job) {
  // Small, bounded server-side maintenance tasks only; never perform camera inference here.
  if (job.kind === "cleanup_metrics") {
    const days = Math.max(7, Math.min(365, Number(job.payload?.days) || 30));
    const r = await pool.query("DELETE FROM skeleton_sessions WHERE created_at < now() - ($1::text || ' days')::interval", [days]);
    return { deleted: r.rowCount, retainedDays: days };
  }
  if (job.kind === "rebuild_stats") {
    const r = await pool.query("SELECT count(*)::int AS sessions, percentile_cont(0.95) WITHIN GROUP (ORDER BY (metrics->>'aiP95')::double precision) FILTER (WHERE metrics ? 'aiP95') AS ai_p95, percentile_cont(0.95) WITHIN GROUP (ORDER BY (metrics->>'ageP95')::double precision) FILTER (WHERE metrics ? 'ageP95') AS age_p95 FROM skeleton_sessions");
    return r.rows[0];
  }
  if (job.kind === "health_check") {
    const r = await pool.query("SELECT now() AS database_time, count(*) FILTER (WHERE status='queued')::int AS queued FROM skeleton_jobs"); return r.rows[0];
  }
  throw new Error("unknown job");
}
let jobBusy = false, lastInlineRecoveryAt = 0;
async function pumpJobs() {
  if (!pool || !dbReady || jobBusy) return;
  jobBusy = true;
  let client;
  try {
    if (Date.now() - lastInlineRecoveryAt > 60000) {
      lastInlineRecoveryAt = Date.now();
      await pool.query("UPDATE skeleton_jobs SET status=CASE WHEN attempts >= 3 THEN 'failed' ELSE 'queued' END, error='recovered after stale worker claim', updated_at=now() WHERE status='running' AND updated_at < now() - interval '5 minutes'");
    }
    client = await pool.connect(); await client.query("BEGIN");
    const q = await client.query("SELECT id,kind,payload,attempts FROM skeleton_jobs WHERE status='queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED");
    if (!q.rowCount) { await client.query("COMMIT"); return; }
    const job = q.rows[0];
    await client.query("UPDATE skeleton_jobs SET status='running',attempts=attempts+1,updated_at=now() WHERE id=$1", [job.id]);
    await client.query("COMMIT"); client.release(); client = null;
    try {
      const result = await runJob(job);
      await pool.query("UPDATE skeleton_jobs SET status='done',result=$2,error=NULL,updated_at=now() WHERE id=$1", [job.id, result]);
    } catch (e) {
      const status = Number(job.attempts) < 2 ? 'queued' : 'failed';
      await pool.query("UPDATE skeleton_jobs SET status=$2,error=$3,updated_at=now() WHERE id=$1", [job.id, status, String(e.message || e).slice(0, 500)]);
    }
  } catch (e) { try { await client?.query("ROLLBACK"); } catch {} console.warn("job worker:", e.message); }
  finally { client?.release(); jobBusy = false; }
}
app.get("/", (_q, res) => res.set("Cache-Control", "no-store, max-age=0").sendFile(path.join(dir, "public", "index.html")));
app.use(express.static(path.join(dir, "public"), { maxAge: 0, setHeaders: (res, file) => { if (/\.(html|js|css)$/.test(file)) res.set("Cache-Control", "no-store, max-age=0, must-revalidate"); } }));
const server = app.listen(PORT, () => console.log(`Skeleton v${VERSION} listening on ${PORT}`));
let dbRetryTimer = null, dbInitBusy = false, inlineJobTimer = null;
async function retryDbInit() {
  if (!pool || dbReady || dbInitBusy) return;
  dbInitBusy = true;
  try { await initDb(); console.log("PostgreSQL ready"); clearInterval(dbRetryTimer); dbRetryTimer = null; if (process.env.RUN_INLINE_JOBS === "true") inlineJobTimer = setInterval(pumpJobs, 1500); }
  catch (e) { console.error("PostgreSQL init failed; retrying:", e.message); }
  finally { dbInitBusy = false; }
}
if (pool) { pool.on("error", (e) => console.error("PostgreSQL pool error:", e.message)); void retryDbInit(); dbRetryTimer = setInterval(() => void retryDbInit(), 10000); }
const shutdown = async () => { server.close(); clearInterval(dbRetryTimer); clearInterval(inlineJobTimer); if (pool) await pool.end(); process.exit(0); };
process.on("SIGTERM", shutdown); process.on("SIGINT", shutdown);
