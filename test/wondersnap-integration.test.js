import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('WonderSnap is embedded in Skeleton and camera is requested on entry', () => {
  const html = read('public/index.html');
  const main = read('public/js/main.js');
  const css = read('public/css/style.css');
  assert.match(html, /id="wonderBtn"[^>]*type="button"/);
  assert.match(html, /id="wonderOverlay"/);
  assert.match(html, /id="wonderFrame"[^>]*allow="camera; fullscreen; autoplay"/);
  assert.match(main, /wonderFrame\.src = wonderEntryUrl\(\)/);
  assert.match(main, /function openWonder\(\)[\s\S]*?stopCamera\(\)/);
  assert.match(main, /function closeWonder\(\)[\s\S]*?requestStart\(\)/);
  assert.match(main, /queueMicrotask\(\(\) => \{ if \(!wonderOpen && !meeting\.opened && !running\) void requestStart\(\); \}\)/);
  assert.match(css, /\.wonder-overlay/);
  assert.doesNotMatch(main, /wonderQualityTier|deviceMemory|hardwareConcurrency/);
  assert.match(main, /new URLSearchParams\(\{ autostart: "camera" \}\)/);
  assert.doesNotMatch(main, /n: String\(quality\.particles\)|dpr: String\(quality\.dpr\)|trails: String\(quality\.trails\)/);
});

test('WonderSnap is isolated and only vendored by the Render web build', () => {
  const render = read('render.yaml');
  const server = read('server.js');
  const vendor = read('scripts/vendor-wondersnap.mjs');
  const main = read('public/js/main.js');
  assert.match(render, /name: skeleton-low-latency[\s\S]*?buildCommand: npm install && npm run vendor:wondersnap/);
  assert.match(render, /name: skeleton-jobs[\s\S]*?buildCommand: npm install\n/);
  assert.match(server, /app\.use\("\/wondersnap\/node_modules"/);
  assert.match(server, /app\.use\("\/wondersnap"/);
  assert.match(server, /const VERSION = "20\.4\.0"/);
  assert.match(vendor, /AkbarSheikh-debug\/wondersnap\.git/);
  assert.match(vendor, /DEFAULT_UPSTREAM_COMMIT = 'cf2dcb1f27313175f9b7482bf427f76240452c23'/);
  assert.match(vendor, /upstreamCommit\.toLowerCase\(\) !== requestedCommit\.toLowerCase\(\)/);
  assert.match(vendor, /GESTURE_PROFILES/);
  assert.match(vendor, /setGestureSensitivity\(name\)/);
  assert.match(vendor, /src\/models\/catalog\.js/);
  assert.match(vendor, /models\/hand_landmarker\.task/);
  assert.match(vendor, /LICENSE/);
  assert.match(vendor, /verifyWonderSnapModelCatalog/);
  assert.match(vendor, /npm.*ci.*--prefix.*--omit=dev/);
  assert.match(vendor, /skeleton:wondersnap:metrics/);
  assert.match(vendor, /ideal: 1280/);
  assert.match(vendor, /ideal: 720/);
  assert.match(vendor, /do not rewrite the upstream camera request/);
  assert.doesNotMatch(vendor, /handSource = handSource\.replace/);
  assert.match(read('public/js/renderer.js'), /Fingertip marker visuals are intentionally disabled/);
  assert.doesNotMatch(read('public/js/renderer.js'), /this\.tips\(s, size, al, W, H, now\)/);
  assert.match(main, /function wonderEntryUrl\(\)/);
  assert.match(main, /autostart: "camera"/);
  assert.match(main, /event.source !== wonderFrame.contentWindow/);
});

test('camera frame payloads are not sent to PostgreSQL; only aggregate metrics are accepted', () => {
  const server = read('server.js');
  const main = read('public/js/main.js');
  assert.match(server, /Store coarse session summaries only; never stream landmarks or images to the server/);
  assert.match(server, /const numericKeys = \["aiP50", "aiP95", "ageP95", "renderP95", "cameraFps", "aiFps", "displayFps", "dropped", "stale"\]/);
  assert.match(main, /persistAggregateMetrics\(\{ aiP95, ageP95, renderP95, cameraFps:T\.camFps, aiFps:T\.aiFps, displayFps:T\.dispFps, dropped:T\.dropped, stale:T\.stale/);
  assert.doesNotMatch(server, /INSERT INTO skeleton_sessions\([^)]*frame/i);
});
