/**
 * OG-V1: pure fail-closed read-only readiness policy for a proposed Worker Route.
 * Does not authorise traffic cutover or mutate Cloudflare state.
 */
export const TARGET = 'pruszkow.otwartegminy.pl';
export const ZONE = 'otwartegminy.pl';
export const SCRIPT = 'otwartegminy-public';
export const PATTERN = `${TARGET}/*`;

export function routeMayTouchHost(pattern, host = TARGET) {
  if (typeof pattern !== 'string' || !pattern.trim()) return true; // unknown: block
  // Cloudflare route patterns may optionally start with scheme, and include *.
  const stripped = pattern.trim().replace(/^https?:\/\//i, '');
  const routeHost = stripped.split('/')[0].replace(/:\d+$/, '').toLowerCase();
  const targetHost = host.toLowerCase();
  if (routeHost === targetHost) return true;
  // Match conservatively: any wildcard host that could include target,
  // or malformed/unknown wildcard, needs manual review.
  if (routeHost.includes('*')) {
    const literalHost = routeHost.replace(/\*/g, '');
    return !literalHost || targetHost.endsWith(literalHost) ||
      targetHost.startsWith(literalHost) || routeHost.includes(targetHost);
  }
  return false;
}

export function checkRouteOverlay({ host = TARGET, dns, routes, customDomains, zoneName = ZONE }) {
  const blockers = [];
  if (host !== TARGET || zoneName !== ZONE) blockers.push('Unexpected host or zone: deny outside the Pruszków subdomain.');
  if (!Array.isArray(dns)) blockers.push('DNS read unavailable.');
  if (!Array.isArray(routes)) blockers.push('Workers Routes read unavailable.');
  if (!Array.isArray(customDomains)) blockers.push('Worker Custom Domains read unavailable.');

  if (Array.isArray(dns)) {
    const records = dns.filter(x => x.name === host);
    if (dns.length !== records.length) blockers.push('DNS read returned another hostname.');
    if (records.length !== 1) blockers.push(`Expected exactly one pre-existing DNS record, got ${records.length}.`);
    const c = records[0];
    if (c) {
      if (c.type !== 'CNAME') blockers.push('Expected current CNAME; DNS topology has changed.');
      if (c.proxied !== true) blockers.push('DNS is not proxied (orange-clouded).');
      if (!/\.cfargotunnel\.com\.?$/i.test(c.content ?? '')) blockers.push('CNAME no longer points at the recorded Cloudflare Tunnel type.');
      if (!c.id) blockers.push('DNS record id not captured for baseline comparison.');
    }
  }

  if (Array.isArray(routes)) {
    const collisions = routes.filter(r=>routeMayTouchHost(r.pattern, host));
    if (collisions.length) {
      blockers.push(`Found ${collisions.length} pre-existing Worker Route pattern(s) that may affect the target hostname; do not overwrite or delete them.`);
    }
  }
  if (Array.isArray(customDomains) && customDomains.some(d=>d.hostname === host)) {
    blockers.push('A Workers Custom Domain is already attached to this hostname.');
  }
  return {ok: blockers.length===0, blockers};
}

export function getProposedRoute() {
  return {pattern:PATTERN, script:SCRIPT};
}
