// Render Background Worker: asynchronous maintenance jobs never share the camera/API request path.
import { Pool } from 'pg';
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL is required for jobs-worker'); process.exit(1); }
const pool = new Pool({ connectionString: DATABASE_URL, ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 5000 });
let busy = false, stopping = false, lastRecoveryAt = 0;
async function ensureSchema() {
  await pool.query(`CREATE TABLE IF NOT EXISTS skeleton_jobs (
    id BIGSERIAL PRIMARY KEY, kind TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
    attempts INTEGER NOT NULL DEFAULT 0, result JSONB, error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS skeleton_jobs_queue_idx ON skeleton_jobs(status, created_at)');
  await pool.query(`CREATE TABLE IF NOT EXISTS skeleton_sessions (
    id BIGSERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), client_tag TEXT, metrics JSONB NOT NULL DEFAULT '{}'::jsonb
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS skeleton_sessions_created_idx ON skeleton_sessions(created_at DESC)');
  // Recover abandoned claims. A job gets at most three attempts even if the worker repeatedly crashes.
  await pool.query("UPDATE skeleton_jobs SET status=CASE WHEN attempts >= 3 THEN 'failed' ELSE 'queued' END, error='recovered after stale worker claim', updated_at=now() WHERE status='running' AND updated_at < now() - interval '5 minutes'");
}
async function runJob(job) {
  if (job.kind === 'cleanup_metrics') {
    const days = Math.max(7, Math.min(365, Number(job.payload?.days) || 30));
    const r = await pool.query("DELETE FROM skeleton_sessions WHERE created_at < now() - ($1::text || ' days')::interval", [days]);
    return { deleted: r.rowCount, retainedDays: days };
  }
  if (job.kind === 'rebuild_stats') {
    const r = await pool.query(`SELECT count(*)::int AS sessions,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY (metrics->>'aiP95')::double precision) FILTER (WHERE metrics ? 'aiP95') AS ai_p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY (metrics->>'aiP95')::double precision) FILTER (WHERE metrics ? 'aiP95') AS ai_p95,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY (metrics->>'ageP95')::double precision) FILTER (WHERE metrics ? 'ageP95') AS age_p95
      FROM skeleton_sessions`);
    return r.rows[0];
  }
  if (job.kind === 'health_check') {
    const r = await pool.query("SELECT now() AS database_time, count(*) FILTER (WHERE status='queued')::int AS queued, count(*) FILTER (WHERE status='failed')::int AS failed FROM skeleton_jobs");
    return r.rows[0];
  }
  throw new Error(`unsupported job kind: ${job.kind}`);
}
async function tick() {
  if (busy || stopping) return; busy = true; let client;
  try {
    if (Date.now() - lastRecoveryAt > 60000) {
      lastRecoveryAt = Date.now();
      await pool.query("UPDATE skeleton_jobs SET status=CASE WHEN attempts >= 3 THEN 'failed' ELSE 'queued' END, error='recovered after stale worker claim', updated_at=now() WHERE status='running' AND updated_at < now() - interval '5 minutes'");
    }
    client = await pool.connect(); await client.query('BEGIN');
    const q = await client.query("SELECT id,kind,payload,attempts FROM skeleton_jobs WHERE status='queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED");
    if (!q.rowCount) { await client.query('COMMIT'); return; }
    const job = q.rows[0];
    await client.query("UPDATE skeleton_jobs SET status='running',attempts=attempts+1,updated_at=now() WHERE id=$1", [job.id]);
    await client.query('COMMIT'); client.release(); client = null;
    try {
      const result = await runJob(job);
      await pool.query("UPDATE skeleton_jobs SET status='done',result=$2,error=NULL,updated_at=now() WHERE id=$1", [job.id, result]);
    } catch (e) {
      const retry = Number(job.attempts) < 2;
      await pool.query('UPDATE skeleton_jobs SET status=$2,error=$3,updated_at=now() WHERE id=$1', [job.id, retry ? 'queued' : 'failed', String(e?.message || e).slice(0,500)]);
    }
  } catch (e) { try { await client?.query('ROLLBACK'); } catch {} console.error('job worker poll failed:', e?.message || e); }
  finally { client?.release(); busy = false; }
}
async function shutdown() { if (stopping) return; stopping = true; clearInterval(timer); try { await pool.end(); } finally { process.exit(0); } }
let timer;
try { await ensureSchema(); console.log('Skeleton jobs worker ready'); timer = setInterval(() => void tick(), 1250); void tick(); }
catch (e) { console.error('Unable to initialise background worker:', e); process.exitCode = 1; await pool.end(); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
