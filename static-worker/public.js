/**
 * Public release-candidate Worker.
 *
 * The opposite posture to `index.js`: no Basic Auth, because these routes are
 * meant for residents. Everything that made the preview safe still applies:
 *
 *     even though the build never emits them;
 *   - legacy addresses redirect after the same path checks;
 *   - only files from `static-out-public/` are served — the preview build, the
 *   - no framework: the isolate parses two small modules and returns a file.
 *
 * The protected preview keeps its own Worker and its own build; this file is
 * never deployed by merging, only by an explicit operator action.
 */
import { isProtectedPath, resolveAssetPath } from './gate.js';
import { resolveRedirect } from './redirects.js';

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
};

function notFound() {
  return new Response('404 Nie znaleziono zasobu.', {
    status: 404,
    headers: { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (isProtectedPath(url.pathname)) return notFound();

    const legacyTarget = resolveRedirect(url.pathname);
    if (legacyTarget !== null) {
      return new Response(null, {
        status: 301,
        headers: { ...SECURITY_HEADERS, Location: `${legacyTarget}${url.search}`, 'Cache-Control': 'no-store' },
      });
    }

    const assetUrl = new URL(request.url);
    assetUrl.pathname = resolveAssetPath(url.pathname);

    const assetResponse = await env.ASSETS.fetch(new Request(assetUrl, request));
    if (!assetResponse.ok) return notFound();

    const response = new Response(assetResponse.body, assetResponse);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      response.headers.set(name, value);
    }
    // A publication replaces the generation; five minutes is short enough that
    // a stale page cannot outlive the operator's own verification run.
    response.headers.set('Cache-Control', 'public, max-age=300, must-revalidate');
    return response;
  },
};

export default worker;
