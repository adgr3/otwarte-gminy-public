/**
 * `/okna-ofertowe/` — filter server-rendered tender windows by `?max=`.
 *
 * Rows are in the HTML, so the page works without JS; this only hides rows and
 * keeps the URL shareable.
 */
function apply() {
  const input = document.getElementById('tenders-max');
  const rows = [...document.querySelectorAll('[data-window-days]')];
  if (!input) return;
  const raw = Number.parseInt(input.value, 10);
  const max = Number.isFinite(raw) && raw >= 0 ? raw : null;
  let visible = 0;
  for (const row of rows) {
    const days = Number.parseInt(row.dataset.windowDays, 10);
    const show = max === null || (Number.isFinite(days) && days <= max);
    row.hidden = !show;
    if (show) visible += 1;
  }
  const counter = document.getElementById('tenders-count');
  if (counter) counter.textContent = String(visible);
  const params = new URLSearchParams(location.search);
  if (max === null) params.delete('max');
  else params.set('max', String(max));
  history.replaceState(null, '', `${location.pathname}${params.toString() ? `?${params}` : ''}`);
}

function main() {
  const input = document.getElementById('tenders-max');
  if (!input) return;
  const initial = new URLSearchParams(location.search).get('max');
  if (initial !== null && /^\d+$/.test(initial)) input.value = initial;
  input.addEventListener('input', apply);
  input.addEventListener('change', apply);
  apply();
}

main();
