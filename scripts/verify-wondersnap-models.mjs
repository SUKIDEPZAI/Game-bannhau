// Build-time smoke validation for every procedural model in WonderSnap's catalog.
// This intentionally builds a small deterministic sample rather than GPU buffers for
// the full production particle count; real WebGL rendering still needs device testing.
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

export async function verifyWonderSnapModelCatalog(repoPath, { sampleCount = 512, seed = 73 } = {}) {
  const catalogPath = path.join(path.resolve(repoPath), 'src', 'models', 'catalog.js');
  const { CATALOG, buildModel } = await import(pathToFileURL(catalogPath).href);
  if (!Array.isArray(CATALOG) || CATALOG.length === 0 || typeof buildModel !== 'function') {
    throw new Error('WonderSnap catalog is empty or buildModel is unavailable');
  }
  if (!Number.isInteger(sampleCount) || sampleCount < 32 || sampleCount > 4096) {
    throw new Error('sampleCount must be an integer between 32 and 4096');
  }

  const failures = [];
  for (let index = 0; index < CATALOG.length; index++) {
    const def = CATALOG[index];
    try {
      if (!def || typeof def.name !== 'string' || !def.name.trim()) throw new Error('missing model name');
      const m = buildModel(index, sampleCount, seed);
      const expected = {
        target: sampleCount * 3,
        offset: sampleCount * 4,
        tint: sampleCount * 3,
        pick: sampleCount,
      };
      for (const [key, length] of Object.entries(expected)) {
        if (!m[key] || m[key].length !== length) throw new Error(`${key} length ${m[key]?.length ?? 'missing'} != ${length}`);
        for (let i = 0; i < m[key].length; i++) {
          if (!Number.isFinite(m[key][i])) throw new Error(`${key}[${i}] is not finite`);
        }
      }
      if (!Number.isFinite(m.fitScale) || m.fitScale <= 0) throw new Error('invalid fitScale');
    } catch (error) {
      failures.push(`${index} (${def?.name || 'unnamed'}): ${String(error?.message || error)}`);
    }
  }
  if (failures.length) throw new Error(`WonderSnap model validation failed (${failures.length}/${CATALOG.length}):\n${failures.join('\n')}`);
  return { models: CATALOG.length, sampleCount };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const repo = process.argv[2];
  if (!repo) {
    console.error('Usage: node scripts/verify-wondersnap-models.mjs <wondersnap-repository-path>');
    process.exit(2);
  }
  try {
    const result = await verifyWonderSnapModelCatalog(repo);
    console.log(`[wondersnap-check] validated ${result.models} model definitions with ${result.sampleCount} samples/model`);
  } catch (error) {
    console.error(`[wondersnap-check] ${error?.stack || error}`);
    process.exit(1);
  }
}
