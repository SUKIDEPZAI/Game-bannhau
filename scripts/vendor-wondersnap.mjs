// Vendor the upstream MIT-licensed WonderSnap app during the deployment build.
// We keep it isolated from Skeleton's hot camera loop and PostgreSQL API.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'wondersnap');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wondersnap-vendor-'));
const repo = path.join(tmp, 'repo');
const upstream = 'https://github.com/AkbarSheikh-debug/wondersnap.git';
const required = ['index.html', 'styles.css', 'src/app.js', 'src/hands.js', 'src/gl/renderer.js', 'src/models/catalog.js', 'models/hand_landmarker.task', 'LICENSE'];
try {
  console.log(`[vendor] cloning ${upstream}`);
  execFileSync('git', ['clone', '--depth', '1', '--filter=blob:none', upstream, repo], { stdio: 'inherit', timeout: 180000 });
  for (const rel of required) {
    if (!fs.existsSync(path.join(repo, rel))) throw new Error(`Upstream file missing: ${rel}`);
  }
  const next = `${target}.next`;
  fs.rmSync(next, { recursive: true, force: true });
  fs.mkdirSync(next, { recursive: true });
  for (const rel of ['index.html', 'styles.css', 'src', 'models', 'docs', 'LICENSE']) {
    const from = path.join(repo, rel);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(next, rel), { recursive: true });
  }
  fs.writeFileSync(path.join(next, 'UPSTREAM.md'), `# WonderSnap upstream\n\nVendored during the build from ${upstream}\n\nThe upstream project is licensed under MIT; see LICENSE. Skeleton keeps this app isolated at /wondersnap and does not send camera frames to the backend.\n`);
  fs.rmSync(target, { recursive: true, force: true });
  fs.renameSync(next, target);
  console.log('[vendor] WonderSnap vendored successfully');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
