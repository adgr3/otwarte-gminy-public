/**
 * The ASSETS binding, implemented over the files the builder wrote.
 *
 * Used by the Node smoke harness and by the local HTTP harness so both run the
 * REAL `static-worker/index.js` module — only the storage layer differs from
 * workerd, which is where the same Worker runs in CI.
 */
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export function createAssetsBinding(root) {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const target = path.join(root, rel);
      if (!target.startsWith(root)) return new Response('forbidden', { status: 403 });
      try {
        if (!statSync(target).isFile()) return new Response('not found', { status: 404 });
        const body = readFileSync(target);
        return new Response(body, {
          status: 200,
          headers: {
            'content-type': CONTENT_TYPES[path.extname(target).toLowerCase()] ?? 'application/octet-stream',
            'content-length': String(body.byteLength),
            etag: `"${body.byteLength.toString(16)}"`,
          },
        });
      } catch {
        return new Response('not found', { status: 404 });
      }
    },
  };
}
