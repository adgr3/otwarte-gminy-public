/**
 * One controlled publication pipeline (Sprint #018).
 *
 * Refresh → structure check → validate → views → build (preview, public,
 * isolated staging) → optional network link check → receipt.
 *
 * Guarantees:
 *   - no schedule, no deployment, no DNS;
 *   - a failed refresh or validation restores the previously published data;
 *   - the release artifacts are built into `.next` directories and swapped only
 *     after all of them succeeded, so a half-written set is never left behind;
 *   - link checking is fail-closed in this mode: structural coverage must be
 *     100% for BIP and CRU, and every sampled address must answer.
 *
 *   node scripts/static/publish.mjs
 *   node scripts/static/publish.mjs --fetch --views
 *   node scripts/static/publish.mjs --check-links
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { swapArtifacts } from '../../lib/static-swap.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = new Set(process.argv.slice(2));
const steps = [];

const DATA_DIR = path.join(root, 'data', 'public');
const BACKUP_DIR = path.join(root, '.publish-backup');
const ARTIFACTS = [
  { name: 'preview', final: 'static-out', next: 'static-out.next' },
  { name: 'public', final: 'static-out-public', next: 'static-out-public.next' },
  { name: 'staging', final: 'static-out-staging', next: 'static-out-staging.next' },
];

function run(name, command, commandArgs, { env = {}, optional = false } = {}) {
  const started = Date.now();
  try {
    console.log(`\n▶ ${name}: ${command} ${commandArgs.join(' ')}`);
    execFileSync(command, commandArgs, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
    steps.push({ name, status: 'PASS', ms: Date.now() - started });
  } catch (error) {
    if (optional) {
      steps.push({ name, status: 'SKIPPED', ms: Date.now() - started, reason: String(error?.message ?? error) });
      console.warn(`⚠ ${name} skipped: ${String(error?.message ?? error)}`);
      return;
    }
    steps.push({ name, status: 'FAIL', ms: Date.now() - started });
    throw error;
  }
}

function snapshotData() {
  rmSync(BACKUP_DIR, { recursive: true, force: true });
  cpSync(DATA_DIR, BACKUP_DIR, { recursive: true });
  return true;
}

function restoreData() {
  if (!existsSync(BACKUP_DIR)) return;
  rmSync(DATA_DIR, { recursive: true, force: true });
  cpSync(BACKUP_DIR, DATA_DIR, { recursive: true });
  console.log('↩ restored the previously published data after a failed run');
}

function cleanupNext() {
  for (const artifact of ARTIFACTS) rmSync(path.join(root, artifact.next), { recursive: true, force: true });
}

function cleanupBackup() {
  rmSync(BACKUP_DIR, { recursive: true, force: true });
}

function readJson(rel) {
  const target = path.join(root, rel);
  return existsSync(target) ? JSON.parse(readFileSync(target, 'utf8')) : null;
}

function receipt(status, extra = {}) {
  return {
    schema: 'og.static.publish.v2',
    status,
    startedAt: new Date().toISOString(),
    steps,
    data: {
      bipGenerationId: readJson('data/public/pruszkow/contracts-facets.json')?.generationId ?? null,
      cruGenerationId: readJson('data/public/pruszkow/contracts-cru-facets.json')?.generationId ?? null,
    },
    ...extra,
    note: 'Bez harmonogramu i bez deploymentu. Publikacja kończy się na artefakcie.',
  };
}

let refreshed = false;

try {
  // ---------------------------------------------------------------- refresh
  if (args.has('--fetch')) {
    snapshotData();
    refreshed = true;
    run('refresh BIP', 'python', ['-B', 'scripts/run_pruszkow.py', 'contracts']);
    run('refresh CRU', 'python', ['-B', 'scripts/run_cru.py']);
  } else {
    steps.push({ name: 'refresh BIP/CRU', status: 'SKIPPED', reason: 'no --fetch: using committed data' });
  }

  // ------------------------------------------- structure (100%, no network)
  run('source-link structure (100% of records)', 'node', ['scripts/static/check-links.mjs', '--structure', '--strict']);

  if (args.has('--views')) {
    run('generate registry views', 'npx', ['tsx', 'scripts/generate-registry-views.ts']);
  } else {
    steps.push({ name: 'generate registry views', status: 'SKIPPED', reason: 'no --views: using committed views' });
  }

  // ---------------------------------------------------------------- builds
  // Every build writes to a `.next` directory; the final directories are only
  // replaced once all of them succeeded.
  cleanupNext();
  run('build protected preview', 'npx', ['tsx', 'scripts/static/build-static-site.mjs'], {
    env: { STATIC_OUT_DIR: 'static-out.next' },
  });
  run('build public candidate', 'npx', ['tsx', 'scripts/static/build-static-site.mjs', '--public'], {
    env: { STATIC_OUT_DIR: 'static-out-public.next' },
  });
  run('build isolated staging (noindex)', 'npx', ['tsx', 'scripts/static/build-static-site.mjs', '--staging'], {
    env: { STATIC_OUT_DIR: 'static-out-staging.next' },
  });

  // --------------------------------------------------------- network sample
  let network = null;
  if (args.has('--check-links')) {
    run('network link sample (40 official addresses)', 'node', ['scripts/static/check-links.mjs', '--sample', '40', '--strict']);
    network = readJson('link-check.json')?.network ?? null;
  } else {
    steps.push({ name: 'network link sample', status: 'SKIPPED', reason: 'no --check-links' });
  }

  // ---------------------------------------------------------------- verify
  // Never swap a set that does not describe the same generation.
  const bipGeneration = readJson('data/public/pruszkow/contracts-facets.json')?.generationId ?? null;
  const manifests = ARTIFACTS.map((artifact) => ({
    artifact,
    manifest: readJson(path.join(artifact.next, 'manifest.json')),
  }));
  for (const { artifact, manifest } of manifests) {
    if (!manifest) throw new Error(`${artifact.next}: missing manifest.json`);
    if (manifest.generationId !== bipGeneration) {
      throw new Error(`${artifact.next}: generation ${manifest.generationId} != data ${bipGeneration}`);
    }
    if (manifest.counts?.total !== manifests[0].manifest?.counts?.total) {
      throw new Error(`${artifact.next}: counts differ from ${manifests[0].artifact.next}`);
    }
    const expectedVisibility = artifact.name === 'preview' ? 'preview' : artifact.name === 'public' ? 'public' : 'staging';
    if (manifest.visibility !== expectedVisibility) {
      throw new Error(`${artifact.next}: visibility ${manifest.visibility} != ${expectedVisibility}`);
    }
  }
  steps.push({ name: 'verify artifacts (generation, counts, visibility)', status: 'PASS', ms: 0 });

  // ---------------------------------------------------------------- swap
  // All three move together: a failure while swapping the second one restores
  // the first. PUBLISH_FAULT exists to prove this in tests.
  swapArtifacts({
    root,
    artifacts: ARTIFACTS.map((artifact) => ({ name: artifact.name, final: artifact.final, next: artifact.next })),
    faultAfter: process.env.PUBLISH_FAULT ?? null,
  });
  steps.push({ name: 'atomic swap of all artifacts', status: 'PASS', ms: 0 });

  cleanupBackup();

  const result = receipt('PASS', { network });
  for (const artifact of ARTIFACTS) {
    writeFileSync(path.join(root, artifact.final, 'publish-receipt.json'), JSON.stringify(result, null, 2));
  }
  console.log(`\n${JSON.stringify({ status: result.status, data: result.data, network }, null, 2)}`);
} catch (error) {
  cleanupNext();
  if (refreshed) restoreData();
  cleanupBackup();
  const result = receipt('FAIL', { error: String(error?.message ?? error) });
  console.error(`\nPUBLISH=FAIL\n${result.error}`);
  process.exitCode = 1;
}
