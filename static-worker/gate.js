/**
 * Public static Worker path helpers.
 *
 * The public snapshot contains no protected namespaces.  The only checks kept
 * here are generic path-traversal and PDF protection.
 */
export function isProtectedPath(pathname) {
  const path = pathname.toLowerCase();
  if (path.includes('..') || path.includes('\\')) return true;
  if (path.endsWith('.pdf')) return true;
  return false;
}

export function resolveAssetPath(pathname) {
  if (pathname === '/' || pathname === '') return '/index.html';
  const last = pathname.slice(pathname.lastIndexOf('/') + 1);
  if (last.includes('.')) return pathname;
  return pathname.endsWith('/') ? `${pathname}index.html` : `${pathname}/index.html`;
}
