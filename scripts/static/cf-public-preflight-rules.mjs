/**
 * Pure, fail-closed DNS guards for the CURRENT Worker Custom Domain cutover.
 * Cloudflare Workers documentation explicitly forbids creating a Custom
 * Domain on a hostname that has a CNAME record.
 *
 * This policy must be replaced/reviewed if the deployment is changed to
 * a Workers Route. It makes no API requests or mutations.
 */
export function classifyDnsBinding(records = []) {
  if (records.some((item) =>
    item.type === 'CNAME' && /\.cfargotunnel\.com\.?$/i.test(item.content ?? '')
  )) {
    return {
      type: 'cloudflare_tunnel',
      note: 'Existing proxied CNAME points to a Cloudflare Tunnel; preserve it until a separately approved route-based or planned DNS migration.',
    };
  }
  if (records.some((item) => item.type === 'CNAME')) {
    return { type: 'dns_cname', note: 'Existing CNAME DNS origin; incompatible with the planned Workers Custom Domain.' };
  }
  if (records.length) {
    return { type: 'dns_origin', note: 'Cloudflare DNS origin; capture and verify exact rollback before cutover.' };
  }
  return { type: 'none' };
}

export function customDomainCnameBlockers(records = [], host = '') {
  const names = records.filter((item) => item.type === 'CNAME' && item.name === host);
  return names.length
    ? [
      `BLOCKED: ${host} already has ${names.length} CNAME DNS record(s). Cloudflare Workers Custom Domains cannot be created on hostnames with existing CNAME records. Never delete or replace the current DNS/Tunnel as part of an automatic deploy; design an explicitly approved Workers Route or DNS cutover with rollback first.`,
    ]
    : [];
}
