/**
 * Public legacy and canonical redirects.
 *
 * Redirects are only added where the target is a genuine public equivalent.
 * Pages without an equivalent are left to 404.
 */

const SLUG = 'pruszkow-1421021';

const LEGACY = {
  [`/umowy/gmina/${SLUG}/wykonawcy`]: '/umowy/wykonawcy/',
  '/wykonawcy': '/umowy/wykonawcy/',
};

const CANONICAL_SLASH = new Set([
  `/umowy/gmina/${SLUG}`,
  `/umowy/gmina/${SLUG}/aktywnosc`,
  `/umowy/gmina/${SLUG}/wykonawcy/historia`,
  `/umowy/gmina/${SLUG}/wykonawcy/zmiany`,
  '/dane',
  '/porownaj',
  '/teczka',
  '/okna-ofertowe',
  '/siec-wykonawcow',
]);

export function resolveRedirect(pathname) {
  const hadSlash = pathname.length > 1 && pathname.endsWith('/');
  const path = hadSlash ? pathname.slice(0, -1) : pathname;

  if (!hadSlash && CANONICAL_SLASH.has(path)) return `${path}/`;

  const direct = LEGACY[path];
  if (direct !== undefined) return direct;

  // `/wykonawca/<id>` was the older single-contractor alias.
  const contractor = path.match(/^\/wykonawca\/([a-z0-9]+)$/);
  if (contractor) return `/umowy/wykonawcy/${contractor[1]}/`;

  return null;
}

export const LEGACY_REDIRECT_PATHS = Object.freeze(['/wykonawcy']);
