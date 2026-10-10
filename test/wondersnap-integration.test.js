import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('WonderSnap integration is isolated and only vendored by the Render web build', () => {
  const render = read('render.yaml');
  const server = read('server.js');
  const html = read('public/index.html');
  const vendor = read('scripts/vendor-wondersnap.mjs');
  assert.match(render, /name: skeleton-low-latency[\s\S]*?buildCommand: npm install && npm run vendor:wondersnap/);
  assert.match(render, /name: skeleton-jobs[\s\S]*?buildCommand: npm install\n/);
  assert.match(server, /app\.use\("\/wondersnap\/node_modules"/);
  assert.match(server, /app\.use\("\/wondersnap"/);
  assert.match(server, /const VERSION = "19\.0\.0"/);
  assert.match(html, /href="\/wondersnap\/"/);
  assert.match(vendor, /AkbarSheikh-debug\/wondersnap\.git/);
  assert.match(vendor, /LICENSE/);
});
