// Vendor a pinned WonderSnap build, upgrade its real gesture interactions and hand HUD,
// localize the interface to Vietnamese, and retain safe camera defaults and model validation.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { verifyWonderSnapModelCatalog } from './verify-wondersnap-models.mjs';
import { patchWonderSnapApp, patchWonderSnapGestures, localizeWonderSnapHtml, localizeWonderSnapFeatures } from './wondersnap-upgrade.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'wondersnap');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wondersnap-vendor-'));
const repo = path.join(tmp, 'repo');
const upstream = 'https://github.com/AkbarSheikh-debug/wondersnap.git';
// Reviewed upstream main HEAD on 2026-10-12; pin it so deployments are reproducible.
const DEFAULT_UPSTREAM_COMMIT = 'cf2dcb1f27313175f9b7482bf427f76240452c23';
const required = ['index.html', 'styles.css', 'src/app.js', 'src/features.js', 'src/hands.js', 'src/gl/renderer.js', 'src/logic/gestures.js', 'src/logic/controller.js', 'src/models/catalog.js', 'src/models/wonders.js', 'src/models/engines.js', 'src/models/vehicles.js', 'src/models/anatomy.js', 'src/models/anatomy2.js', 'src/models/body.js', 'src/models/biology.js', 'src/models/machines.js', 'models/hand_landmarker.task', 'package.json', 'package-lock.json', 'LICENSE'];
try {
  const requestedCommit = String(process.env.WONDERSNAP_COMMIT || DEFAULT_UPSTREAM_COMMIT).trim();
  if (!/^[0-9a-f]{40}$/i.test(requestedCommit)) throw new Error('WONDERSNAP_COMMIT must be a full 40-character Git commit SHA');
  console.log(`[vendor] fetching pinned ${upstream}@${requestedCommit}`);
  fs.mkdirSync(repo, { recursive: true });
  execFileSync('git', ['init', repo], { stdio: 'inherit', timeout: 30000 });
  execFileSync('git', ['-C', repo, 'remote', 'add', 'origin', upstream], { stdio: 'inherit', timeout: 30000 });
  execFileSync('git', ['-C', repo, 'fetch', '--depth=1', 'origin', requestedCommit], { stdio: 'inherit', timeout: 180000 });
  execFileSync('git', ['-C', repo, 'checkout', '--detach', 'FETCH_HEAD'], { stdio: 'inherit', timeout: 30000 });
  const upstreamCommit = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (upstreamCommit.toLowerCase() !== requestedCommit.toLowerCase()) {
    throw new Error(`WonderSnap revision mismatch: requested ${requestedCommit}, checked out ${upstreamCommit}`);
  }
  console.log(`[vendor] verified pinned commit ${upstreamCommit}`);
  for (const rel of required) {
    if (!fs.existsSync(path.join(repo, rel))) throw new Error(`Upstream file missing: ${rel}`);
  }

  // Preserve and verify the upstream gesture-sensitivity feature introduced in the pinned revision.
  const gesturesSource = fs.readFileSync(path.join(repo, 'src', 'logic', 'gestures.js'), 'utf8');
  const controllerSource = fs.readFileSync(path.join(repo, 'src', 'logic', 'controller.js'), 'utf8');
  if (!gesturesSource.includes('GESTURE_PROFILES') || !gesturesSource.includes('forgiving: FORGIVING')) {
    throw new Error('Pinned WonderSnap source is missing Standard/More forgiving gesture sensitivity presets');
  }
  if (!controllerSource.includes('setGestureSensitivity(name)')) {
    throw new Error('Pinned WonderSnap source is missing the gesture-sensitivity controller API');
  }

  // Fail the build early if any procedural model throws or emits malformed GPU buffers.
  const checked = await verifyWonderSnapModelCatalog(repo, { sampleCount: 512, seed: 73 });
  console.log(`[vendor] model smoke check passed: ${checked.models} models`);

  // Post only a coarse once-per-second diagnostic to the same-origin Skeleton iframe parent.
  // Never relay video, images, hands, or raw landmarks.
  const appFile = path.join(repo, 'src', 'app.js');
  let appSource = fs.readFileSync(appFile, 'utf8');
  const handFile = path.join(repo, 'src', 'hands.js');
  const handSource = fs.readFileSync(handFile, 'utf8');
  const cameraAnchor = "video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user', frameRate: { ideal: 30 } }";
  // Validate but do not rewrite the upstream camera request. Past hand-tuned overrides
  // were not backed by an on-device latency comparison and caused Skeleton to diverge
  // from the known-fast direct WonderSnap route.
  if (!handSource.includes(cameraAnchor)) throw new Error('WonderSnap upstream camera path changed; review latency parity before updating');

  // Apply the reviewed, localized interaction upgrade. Each required patch has an exact
  // upstream anchor; the build stops if upstream changes under the pinned revision.
  const fpsPatch = `if (t - this._fpsT >= 1) { this.fps = this._fpsN / (t - this._fpsT); this._fpsN = 0; this._fpsT = t; if (window.parent !== window) window.parent.postMessage({ type: 'skeleton:wondersnap:metrics', fps: this.fps, aiMs: this.cam?.frames ? this.cam.detectMs : null, particles: CFG.n, model: CATALOG[this.ctl.state.index]?.name || 'unknown' }, location.origin); }`;
  appSource = patchWonderSnapApp(appSource, { fpsPatch });
  fs.writeFileSync(appFile, appSource);

  const htmlFile = path.join(repo, 'index.html');
  fs.writeFileSync(htmlFile, localizeWonderSnapHtml(fs.readFileSync(htmlFile, 'utf8')));
  const featuresFile = path.join(repo, 'src', 'features.js');
  fs.writeFileSync(featuresFile, localizeWonderSnapFeatures(fs.readFileSync(featuresFile, 'utf8')));
  const gesturesFile = path.join(repo, 'src', 'logic', 'gestures.js');
  fs.writeFileSync(gesturesFile, patchWonderSnapGestures(fs.readFileSync(gesturesFile, 'utf8')));
  const stylesFile = path.join(repo, 'styles.css');
  let styleSource = fs.readFileSync(stylesFile, 'utf8');
  const futuristicTheme = `
/* Skeleton/WonderSnap Vietnamese sci-fi interaction layer */
:root { --accent: #65efff; --accent-2: #ffc66d; --glass-edge: rgba(101,239,255,.24); }
.logo { box-shadow: 0 0 18px rgba(74,227,255,.68), inset 0 0 12px rgba(74,227,255,.16); }
.tab.active, .chip.active, button:focus-visible { box-shadow: 0 0 16px rgba(74,227,255,.19), inset 0 0 12px rgba(74,227,255,.08); }
.guide li.hot { background: linear-gradient(105deg,rgba(39,183,220,.17),rgba(255,181,83,.07)); }
/* The anatomical hand is drawn in Canvas with cyan mesh, joint reticles, scan glow and amber energy nodes. */
`;
  if (!styleSource.includes('Skeleton/WonderSnap Vietnamese sci-fi interaction layer')) styleSource += futuristicTheme;
  fs.writeFileSync(stylesFile, styleSource);
  // src/hands.js is copied unchanged to preserve upstream camera constraints and tracking.

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
  execFileSync('npm', ['ci', '--prefix', next, '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { stdio: 'inherit', timeout: 240000 });

  fs.writeFileSync(path.join(next, 'UPSTREAM.md'), `# WonderSnap upstream

Repository: ${upstream}
Resolved commit: ${upstreamCommit}
Requested pin: ${requestedCommit}
Reviewed upstream change: commit ${requestedCommit} adds gesture sensitivity presets (Standard / More forgiving)

The upstream project is licensed under MIT; see LICENSE. This deployment pins the reviewed revision and checks out the exact commit before building. Its Standard / More forgiving gesture-sensitivity profiles are required and smoke-checked. Upstream src/hands.js camera constraints and the particle/DPR/trail defaults are kept unchanged to match the direct WonderSnap route. The build patches the live hand overlay into a cyan mesh/joint-reticle HUD, adds two-hand zoom+rotation, pinch-select-and-drag part extraction, a fast open-palm repulsor pulse, a two-thumbs-up energy shield, Vietnamese model categories/part labels/voice commands, validates every catalog model with a deterministic 512-particle smoke build, and installs dependencies in an isolated wondersnap/node_modules directory. The embedded parent message carries only coarse FPS/inference timing and the current model label; no frames or landmarks are transmitted.
`);
  fs.rmSync(target, { recursive: true, force: true });
  fs.renameSync(next, target);
  console.log('[vendor] WonderSnap vendored and validated successfully');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
