/**
 * Signal-case identity, reproduced exactly (Sprint #018).
 *
 * The production app addresses a signal case as `/umowy/sygnaly/sig_<16 hex>`,
 * where the hex is the first 16 characters of SHA-256 over a canonical payload
 * (`lib/signal-case.ts`). The static build must keep those addresses working,
 * so it recomputes the same id from the published aggregate instead of
 * inventing a new one.
 *
 * `tests/static-signals.test.ts` proves this matches `lib/signal-case.ts` for
 * every cluster in the current generation.
 */
import { createHash } from 'node:crypto';

export const NEAR_THRESHOLD_RATIO = 0.7;
export const CLUSTER_WINDOW_DAYS = 180;
export const MIN_CLUSTER_RECORDS = 2;

/** Same canonicalisation as lib/signal-case.ts canonicalJson. */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
}

export function signalIdPayload(cluster, municipalitySlug) {
  return {
    schema: 'otwartegminy.signal.v1',
    detector: 'THRESHOLD_CLUSTER',
    municipality: municipalitySlug,
    thresholdIntervalId: cluster.threshold.id,
    thresholdPlnNet: cluster.threshold.thresholdPlnNet,
    nearThresholdRatio: NEAR_THRESHOLD_RATIO,
    clusterWindowDays: cluster.windowDays ?? CLUSTER_WINDOW_DAYS,
    minClusterRecords: MIN_CLUSTER_RECORDS,
    records: [...new Set(cluster.records.map((record) => record.id))].sort(),
  };
}

export function signalCaseId(cluster, municipalitySlug) {
  const digest = createHash('sha256').update(canonicalJson(signalIdPayload(cluster, municipalitySlug))).digest('hex');
  return `sig_${digest.slice(0, 16)}`;
}

export const SIGNAL_ID_REGEX = /^sig_[0-9a-f]{16}$/;

export function isValidSignalCaseId(value) {
  return typeof value === 'string' && SIGNAL_ID_REGEX.test(value);
}
