import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifyWonderSnapModelCatalog } from '../scripts/verify-wondersnap-models.mjs';

function writeFixture(buildExpression) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wondersnap-model-fixture-'));
  fs.mkdirSync(path.join(root, 'src', 'models'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
  fs.writeFileSync(path.join(root, 'src', 'models', 'catalog.js'), `
    export const CATALOG = [{ name: 'fixture' }];
    export function buildModel(index, n, seed) {
      ${buildExpression}
    }
  `);
  return root;
}

test('WonderSnap model verifier accepts correctly shaped finite model buffers', async () => {
  const root = writeFixture(`
    return { target: new Float32Array(n * 3), offset: new Float32Array(n * 4),
      tint: new Float32Array(n * 3), pick: new Float32Array(n), fitScale: 1 };
  `);
  try {
    assert.deepEqual(await verifyWonderSnapModelCatalog(root, { sampleCount: 32, seed: 7 }), { models: 1, sampleCount: 32 });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('WonderSnap model verifier rejects malformed or non-finite buffers', async () => {
  const root = writeFixture(`
    const target = new Float32Array(n * 3); target[0] = Number.NaN;
    return { target, offset: new Float32Array(n * 4), tint: new Float32Array(n * 3),
      pick: new Float32Array(n), fitScale: 1 };
  `);
  try {
    await assert.rejects(verifyWonderSnapModelCatalog(root, { sampleCount: 32 }), /validation failed.*target\[0\] is not finite/s);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('WonderSnap model verifier rejects wrong buffer lengths', async () => {
  const root = writeFixture(`
    return { target: new Float32Array(n * 2), offset: new Float32Array(n * 4),
      tint: new Float32Array(n * 3), pick: new Float32Array(n), fitScale: 1 };
  `);
  try {
    await assert.rejects(verifyWonderSnapModelCatalog(root, { sampleCount: 32 }), /target length .* != 96/s);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
