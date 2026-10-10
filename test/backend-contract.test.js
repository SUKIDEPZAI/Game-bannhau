import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [server, worker, main, html, config, render] = await Promise.all([
  readFile(new URL('../server.js', import.meta.url), 'utf8'),
  readFile(new URL('../jobs-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/js/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/js/config.js', import.meta.url), 'utf8'),
  readFile(new URL('../render.yaml', import.meta.url), 'utf8')
]);

test('PostgreSQL queue claim uses LIMIT before FOR UPDATE SKIP LOCKED in both processes', () => {
  for (const source of [server, worker]) {
    assert.match(source, /ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED/);
    assert.doesNotMatch(source, /ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1/);
  }
});

test('aggregate telemetry is opt-in and payload contains no frame, image or landmarks', () => {
  assert.match(html, /id="metricsConsent" type="checkbox"/);
  assert.match(main, /!\$\("metricsConsent"\)\?\.checked/);
  assert.match(main, /api\/sessions\/metrics/);
  assert.doesNotMatch(main, /JSON\.stringify\(\{[^}]*landmarks/);
});


test('job lookup validates IDs and handles database errors without leaking a rejected async handler', () => {
  assert.match(server, /invalid job id/);
  assert.match(server, /job lookup unavailable/);
  assert.match(server, /\/api\/jobs\/:id/);
});

test('metric payload restricts numeric aggregates to numeric input', () => {
  assert.match(server, /const numericKeys = \["aiP50"/);
  assert.match(server, /typeof v === "number" && Number\.isFinite\(v\)/);
});

test('background worker and optional inline runner recover stale jobs and bound crash retries', () => {
  assert.match(worker, /lastRecoveryAt > 60000/);
  assert.match(server, /lastInlineRecoveryAt > 60000/);
  assert.match(worker, /CASE WHEN attempts >= 3 THEN 'failed' ELSE 'queued' END/);
});

test('the default config does not hard-code a possibly unrelated Render application', () => {
  assert.doesNotMatch(config, /game-bannhau\.onrender\.com/);
  assert.match(config, /SKELETON_CONFIG\?\.renderUrl/);
});

test('Render Blueprint separates web service, background worker, and PostgreSQL', () => {
  assert.match(render, /type: web/);
  assert.match(render, /type: worker/);
  assert.match(render, /type: pserv|databases:/);
  assert.match(render, /fromDatabase:/);
});
