/**
 * Source-link validation (Sprint #018-R1).
 *
 * Two different checks, deliberately separated:
 *
 *   structure — 100% of records, no network: every row must carry an https link
 *               on the expected official host. Reported per source (BIP, CRU).
 *   network   — a deterministic sample (default 40) actually fetched, to show
 *               the institutions' addresses are reachable right now.
 *
 * In publication mode (`--strict`, used by publish.mjs) both are fail-closed:
 * fewer than 100% structural coverage fails, and any sampled address that does
 * not answer 2xx/3xx fails.
 *
 *   node scripts/static/check-links.mjs --structure
 *   node scripts/static/check-links.mjs --sample 40 --strict
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { checkSourceLinks, OFFICIAL_HOSTS } from '../../lib/static-generation.js';

const args = process.argv.slice(2);
const sampleIndex = args.indexOf('--sample');
const SAMPLE = sampleIndex === -1 ? 40 : Number(args[sampleIndex + 1]);
const STRICT = args.includes('--strict');
const STRUCTURE_ONLY = args.includes('--structure');
const TIMEOUT_MS = 20000;
const CONCURRENCY = 6;

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const bip = readJson('data/public/pruszkow/contracts-index.json').records;
const cru = readJson('data/public/pruszkow/contracts-cru-index.json').records;

// ------------------------------------------------------------- structure
const structure = {
  bip: checkSourceLinks(bip, OFFICIAL_HOSTS.bip),
  cru: checkSourceLinks(cru, OFFICIAL_HOSTS.cru),
};
const structureOk = structure.bip.coverage === 100 && structure.cru.coverage === 100 && structure.bip.total > 0 && structure.cru.total > 0;

console.log(
  JSON.stringify(
    {
      structure: {
        bip: { total: structure.bip.total, valid: structure.bip.valid, coverage: structure.bip.coverage },
        cru: { total: structure.cru.total, valid: structure.cru.valid, coverage: structure.cru.coverage },
        ok: structureOk,
      },
    },
    null,
    2,
  ),
);

let network = null;

if (!STRUCTURE_ONLY) {
  const candidates = [
    ...bip.map((record) => ({
      source: 'BIP',
      id: record.id,
      date: record.date ?? record.publicationDate ?? null,
      url: record.sourceAttachmentUrl ?? record.sourcePageUrl,
    })),
    ...cru.map((record) => ({
      source: 'CRU',
      id: record.id,
      date: record.date ?? record.publicationDate ?? null,
      url: record.sourceUrl,
    })),
  ].filter((entry) => typeof entry.url === 'string');

  /**
   * Deterministic stratified sample by DATE: the timeline is split into `n`
   * equal buckets and one record is taken from the middle of each bucket.
   * This covers the whole publication period and different records, instead of
   * the beginning of a sorted catalogue.
   */
  function stratified(entries, n) {
    const dated = entries
      .filter((entry) => typeof entry.date === 'string' && entry.date !== '')
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const pool = dated.length >= n ? dated : entries.slice().sort((a, b) => a.id.localeCompare(b.id));
    const picked = [];
    for (let index = 0; index < n; index += 1) {
      const position = Math.min(pool.length - 1, Math.floor(((index + 0.5) * pool.length) / n));
      const entry = pool[position];
      if (entry && !picked.some((existing) => existing.id === entry.id)) picked.push(entry);
    }
    return picked;
  }

  const perSource = { BIP: [], CRU: [] };
  for (const entry of candidates) perSource[entry.source].push(entry);
  const perSourceCount = Math.max(1, Math.floor(SAMPLE / 2));
  const bipSample = stratified(perSource.BIP, perSourceCount);
  const cruSample = stratified(perSource.CRU, perSourceCount);
  const sample = [...bipSample, ...cruSample];

  async function probe(entry) {
    const attempt = async (method) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await fetch(entry.url, {
          method,
          redirect: 'follow',
          signal: controller.signal,
          headers: { 'user-agent': 'OtwarteGminy-link-check/1.0 (public release candidate)' },
        });
        return { status: response.status, finalUrl: response.url, contentType: response.headers.get('content-type') ?? '' };
      } finally {
        clearTimeout(timer);
      }
    };
    try {
      let result = await attempt('HEAD');
      if (result.status === 405 || result.status === 403 || result.status === 501) result = await attempt('GET');
      return { ...entry, ok: result.status >= 200 && result.status < 400, ...result };
    } catch (error) {
      return { ...entry, ok: false, status: 0, error: String(error?.message ?? error) };
    }
  }

  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < sample.length) {
      const entry = sample[cursor];
      cursor += 1;
      results.push(await probe(entry));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const failed = results.filter((entry) => !entry.ok);
  const byStatus = {};
  for (const entry of results) byStatus[entry.status] = (byStatus[entry.status] ?? 0) + 1;
  const perSourceResult = (source) => {
    const entries = results.filter((entry) => entry.source === source);
    const dates = entries.map((entry) => entry.date).filter(Boolean).sort();
    return {
      checked: entries.length,
      ok: entries.filter((entry) => entry.ok).length,
      distinctRecords: new Set(entries.map((entry) => entry.id)).size,
      periods: dates.length ? { from: dates[0], to: dates.at(-1) } : null,
      distinctYears: new Set(dates.map((date) => date.slice(0, 4))).size,
    };
  };

  network = {
    checked: results.length,
    ok: results.length - failed.length,
    failed: failed.length,
    byStatus,
    perSource: { bip: perSourceResult('BIP'), cru: perSourceResult('CRU') },
    failures: failed.slice(0, 10).map((entry) => `${entry.source} ${entry.status} ${entry.url}`),
  };
}

const report = {
  schema: 'og.static.linkcheck.v2',
  checkedAt: new Date().toISOString(),
  catalogue: { bip: bip.length, cru: cru.length },
  structure,
  network,
  ok: structureOk && (network === null || network.failed === 0),
};
writeFileSync('link-check.json', JSON.stringify(report, null, 2));

if (network) {
  console.log(JSON.stringify({ network }, null, 2));
}

if (!report.ok) {
  console.error(
    `\nLINK_CHECK=FAIL structure=${structureOk ? 'ok' : 'fail'} network=${network ? (network.failed === 0 ? 'ok' : 'fail') : 'skipped'}`,
  );
  if (STRICT) process.exitCode = 1;
} else {
  console.log('\nLINK_CHECK=PASS');
}
