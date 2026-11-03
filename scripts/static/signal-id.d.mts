/** Types for scripts/static/signal-id.mjs. */

export const NEAR_THRESHOLD_RATIO: number;
export const CLUSTER_WINDOW_DAYS: number;
export const MIN_CLUSTER_RECORDS: number;
export const SIGNAL_ID_REGEX: RegExp;

export function canonicalJson(value: unknown): string;
export function signalIdPayload(cluster: unknown, municipalitySlug: string): Record<string, unknown>;
export function signalCaseId(cluster: unknown, municipalitySlug: string): string;
export function isValidSignalCaseId(value: unknown): boolean;
