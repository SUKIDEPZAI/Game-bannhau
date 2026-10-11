// Vendor the upstream MIT-licensed WonderSnap app during deploy. Validate every
// procedural model and install its declared MediaPipe version in an isolated path.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { verifyWonderSnapModelCatalog } from './verify-wondersnap-models.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'wondersnap');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wondersnap-vendor-'));
const repo = path.join(tmp, 'repo');
const upstream = 'https://github.com/AkbarSheikh-debug/wondersnap.git';
const required = ['index.html', 'styles.css', 'src/app.js', 'src/hands.js', 'src/gl/renderer.js', 'src/models/catalog.js', 'src/models/wonders.js', 'src/models/engines.js', 'src/models/vehicles.js', 'src/models/anatomy.js', 'src/models/anatomy2.js', 'src/models/body.js', 'src/models/biology.js', 'src/models/machines.js', 'models/hand_landmarker.task', 'package.json', 'package-lock.json', 'LICENSE'];
try {
  console.log(`[vendor] cloning ${upstream}`);
  execFileSync('git', ['clone', '--depth', '1', '--filter=blob:none', upstream, repo], { stdio: 'inherit', timeout: 180000 });
  for (const rel of required) {
    if (!fs.existsSync(path.join(repo, rel))) throw new Error(`Upstream file missing: ${rel}`);
  }

  // Fail the build early if any procedural model throws or emits malformed GPU buffers.
  const checked = await verifyWonderSnapModelCatalog(repo, { sampleCount: 512, seed: 73 });
  console.log(`[vendor] model smoke check passed: ${checked.models} models`);

  // Post only a coarse once-per-second diagnostic to the same-origin Skeleton iframe parent.
  // Never relay video, images, hands, or raw landmarks.
  const appFile = path.join(repo, 'src', 'app.js');
  let appSource = fs.readFileSync(appFile, 'utf8');
  const fpsAnchor = "if (t - this._fpsT >= 1) { this.fps = this._fpsN / (t - this._fpsT); this._fpsN = 0; this._fpsT = t; }";
  const handFile = path.join(repo, 'src', 'hands.js');
  let handSource = fs.readFileSync(handFile, 'utf8');
  const cameraAnchor = "video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user', frameRate: { ideal: 30 } }";
  if (!handSource.includes(cameraAnchor)) throw new Error('WonderSnap camera config changed upstream; refusing an unverified low-latency patch');
  handSource = handSource.replace(cameraAnchor, "video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user', frameRate: { ideal: 30, max: 30 } }");
  const fpsPatch = `if (t - this._fpsT >= 1) { this.fps = this._fpsN / (t - this._fpsT); this._fpsN = 0; this._fpsT = t; if (window.parent !== window) window.parent.postMessage({ type: 'skeleton:wondersnap:metrics', fps: this.fps, aiMs: this.cam?.frames ? this.cam.detectMs : null, particles: CFG.n, model: CATALOG[this.ctl.state.index]?.name || 'unknown' }, location.origin); }`;
  if (!appSource.includes(fpsAnchor)) throw new Error('WonderSnap FPS instrumentation anchor changed upstream; refusing an unverified patch');
  appSource = appSource.replace(fpsAnchor, fpsPatch);
  fs.writeFileSync(appFile, appSource);
  // Keep the upstream camera workload bounded for more responsive tracking on mobile devices.
  fs.writeFileSync(handFile, handSource);

  const next = `${target}.next`;
  fs.rmSync(next, { recursive: true, force: true });
  fs.mkdirSync(next, { recursive: true });
  for (const rel of ['index.html', 'styles.css', 'src', 'models', 'docs', 'LICENSE', 'package.json', 'package-lock.json']) {
    const from = path.join(repo, rel);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(next, rel), { recursive: true });
  }
  // WonderSnap declares MediaPipe Tasks Vision 1.x; Skeleton remains pinned to 0.10.x.
  // Keep separate versions so neither project breaks the other at runtime.
  console.log('[vendor] installing isolated WonderSnap runtime dependencies');
  execFileSync('npm', ['install', '--prefix', next, '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { stdio: 'inherit', timeout: 240000 });

  fs.writeFileSync(path.join(next, 'UPSTREAM.md'), `# WonderSnap upstream\n\nVendored during the build from ${upstream}\n\nThe upstream project is licensed under MIT; see LICENSE. The build applies a conservative 640×480@30 camera capture preset for lower inference workload and validates every catalog model with a deterministic 512-particle smoke build and installs dependencies in an isolated wondersnap/node_modules directory. The embedded parent message carries only coarse FPS/inference timing and the current model label; no frames or landmarks are transmitted.\n`);
  fs.rmSync(target, { recursive: true, force: true });
  fs.renameSync(next, target);
  console.log('[vendor] WonderSnap vendored and validated successfully');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
