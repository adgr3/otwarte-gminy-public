/**
 * Read-only Cloudflare preflight for the public cutover (Sprint #018-R2).
 *
 * It answers one question before anything is changed: what exactly serves
 * `pruszkow.otwartegminy.pl` today, and can the planned custom-domain cutover be
 * executed (and undone) safely?
 *
 * Read-only: GET requests only. No deploy, no DNS change, no route change.
 *
 * Output (`public-preflight.json`) distinguishes:
 *   - `existingDnsRecords` — records that exist NOW and must be recreated on rollback;
 *   - `existingCustomDomain` — a Worker custom domain already on the hostname
 *     (this is a collision for the static deploy and blocks cutover);
 *   - `rollback` — the exact operations that restore the current state, and
 *     which records/domains were created by the cutover (to be deleted).
 *
 * `cutoverAllowed` is false when any read failed, when DNS is ambiguous, or when
 * the hostname is already bound to another Worker (or a route would intercept it).
 *
 * Environment (never printed):
 *   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (required)
 *   PUBLIC_HOST (default pruszkow.otwartegminy.pl)
 *   ZONE_NAME   (default otwartegminy.pl)
 *   STATIC_WORKER (default otwartegminy-public)
 */
import { writeFileSync } from 'node:fs';
import { classifyDnsBinding, customDomainCnameBlockers } from './cf-public-preflight-rules.mjs';

const token = process.env.CLOUDFLARE_API_TOKEN ?? '';
const account = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
const PUBLIC_HOST = process.env.PUBLIC_HOST ?? 'pruszkow.otwartegminy.pl';
const ZONE_NAME = process.env.ZONE_NAME ?? 'otwartegminy.pl';
const STATIC_WORKER = process.env.STATIC_WORKER ?? 'otwartegminy-public';

if (token === '' || account === '') {
  console.error('cf-public-preflight: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required');
  process.exit(1);
}

const record = {
  schema: 'og.static.public-preflight.v2',
  capturedAt: new Date().toISOString(),
  host: PUBLIC_HOST,
  zone: ZONE_NAME,
  staticWorker: STATIC_WORKER,
  checks: {},
  blockers: [],
  cutoverAllowed: false,
  ok: false,
};

const api = async (path) => {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const error = new Error(`${path}: HTTP ${response.status} ${JSON.stringify(payload.errors ?? [])}`);
    error.status = response.status;
    throw error;
  }
  return payload.result;
};

const check = async (name, fn) => {
  try {
    const value = await fn();
    record.checks[name] = { ok: true };
    return { ok: true, value };
  } catch (error) {
    record.checks[name] = { ok: false, error: String(error?.message ?? error) };
    record.blockers.push(`${name}: ${String(error?.message ?? error)}`);
    return { ok: false, value: null };
  }
};

try {
  const zoneResult = await check('zone', async () => {
    const zones = await api(`/zones?name=${encodeURIComponent(ZONE_NAME)}`);
    if (!zones?.[0]) throw new Error(`zone ${ZONE_NAME} not found for this token`);
    return zones[0];
  });
  if (!zoneResult.ok) throw new Error('zone read failed');
  record.zoneId = zoneResult.value.id;

  const dnsResult = await check('dns', () =>
    api(`/zones/${record.zoneId}/dns_records?name=${encodeURIComponent(PUBLIC_HOST)}`),
  );
  const domainsResult = await check('customDomains', () => api(`/accounts/${account}/workers/domains`));
  const routesResult = await check('routes', () => api(`/zones/${record.zoneId}/workers/routes`));

  record.dns = (dnsResult.value ?? []).map((entry) => ({
    id: entry.id,
    type: entry.type,
    name: entry.name,
    content: entry.content,
    proxied: entry.proxied,
    ttl: entry.ttl,
  }));
  record.existingDnsRecords = record.dns;

  record.customDomains = (domainsResult.value ?? [])
    .filter((entry) => entry.hostname === PUBLIC_HOST)
    .map((entry) => ({
      id: entry.id,
      hostname: entry.hostname,
      service: entry.service,
      environment: entry.environment,
      zone_name: entry.zone_name,
    }));

  record.routes = (routesResult.value ?? [])
    .filter((route) => route.pattern === PUBLIC_HOST || route.pattern.startsWith(`${PUBLIC_HOST}/`))
    .map((route) => ({ id: route.id, pattern: route.pattern, script: route.script }));

  // ---------------------------------------------------------------- analysis
  record.existingCustomDomain = record.customDomains[0] ?? null;

  if (record.customDomains.length > 1) {
    record.blockers.push(`hostname ${PUBLIC_HOST} has ${record.customDomains.length} custom domains`);
  }
  if (record.existingCustomDomain && record.existingCustomDomain.service !== STATIC_WORKER) {
    record.blockers.push(
      `hostname is already a custom domain of ${record.existingCustomDomain.service} ` +
        `(environment ${record.existingCustomDomain.environment}); the static deploy would collide`,
    );
  }
  if (record.routes.length > 0) {
    record.blockers.push(
      `zone routes already match ${PUBLIC_HOST}: ${record.routes.map((route) => `${route.pattern} -> ${route.script}`).join(', ')}`,
    );
  }
  if (record.dns.length === 0) {
    record.blockers.push(`no DNS record exists for ${PUBLIC_HOST}; cutover has no state to restore`);
  }
  const weirdDns = record.dns.filter((entry) => !['A', 'AAAA', 'CNAME'].includes(entry.type));
  if (weirdDns.length > 0) {
    record.blockers.push(`unexpected DNS record types for ${PUBLIC_HOST}: ${weirdDns.map((e) => e.type).join(', ')}`);
  }
  if (record.dns.some((entry) => entry.name !== PUBLIC_HOST)) {
    record.blockers.push('DNS read returned a record for a different hostname');
  }

  // The configured wrangler.public.jsonc uses custom_domain: true.
  // Cloudflare cannot create a Custom Domain where the hostname already has
  // a CNAME; a valid DNS read must not be mistaken for cutover readiness.
  record.blockers.push(...customDomainCnameBlockers(record.dns, PUBLIC_HOST));

  record.binding = record.existingCustomDomain
    ? { type: 'worker_custom_domain', service: record.existingCustomDomain.service }
    : classifyDnsBinding(record.dns);

  record.rollback = {
    strategy:
      record.binding.type === 'worker_custom_domain'
        ? 'delete the custom domain created for the static Worker, then recreate the recorded custom domain for the previous service'
        : 'delete the custom domain created for the static Worker, then recreate the recorded DNS records byte-for-byte',
    deleteAfterCutover: {
      customDomains: [`${PUBLIC_HOST} -> ${STATIC_WORKER}`],
      dnsRecordsCreatedByCloudflare: `all records whose id is not in existingDnsRecords (${record.dns.map((entry) => entry.id).join(', ') || 'none'})`,
    },
    restore: {
      dnsRecords: record.dns,
      customDomain: record.existingCustomDomain,
    },
  };

  // Having valid read-only API permissions is NOT equivalent to having a
  // valid cutover plan. Known CNAME conflicts must always return exit code 2.
  record.cutoverAllowed = record.blockers.length === 0 && record.dns.length > 0;
  record.ok = Object.values(record.checks).every((entry) => entry.ok);
  if (record.binding.type === 'cloudflare_tunnel' || record.binding.type === 'dns_cname') {
    record.rollback.strategy = 'STOP — planned Custom Domain conflicts with existing CNAME. Preserve the captured DNS/Tunnel record; a new approved route-based migration and rollback plan is required.';
    record.rollback.deleteAfterCutover = null;
  }
  writeFileSync('public-preflight.json', JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record, null, 2));

  if (!record.ok) {
    console.error('cf-public-preflight: configuration could not be read completely');
    process.exit(1);
  }
  if (!record.cutoverAllowed) {
    console.error('cf-public-preflight: cutover is NOT allowed, see blockers');
    process.exit(2);
  }
} catch (error) {
  record.blockers.push(String(error?.message ?? error));
  record.cutoverAllowed = false;
  record.ok = false;
  writeFileSync('public-preflight.json', JSON.stringify(record, null, 2));
  console.error(`cf-public-preflight: ${String(error?.message ?? error)}`);
  process.exit(1);
}
