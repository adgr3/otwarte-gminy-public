/**
 * `/siec-wykonawcow/` — filter the server-rendered cross-municipality list.
 */
function apply() {
  const text = (document.getElementById('network-text')?.value ?? '').trim().toLowerCase();
  const muni = document.getElementById('network-muni')?.value ?? '';
  const rows = [...document.querySelectorAll('[data-network-row]')];
  let visible = 0;
  for (const row of rows) {
    const haystack = row.dataset.search ?? '';
    const munis = row.dataset.municipalities ?? '';
    const show = (!text || haystack.includes(text)) && (!muni || munis.split(' ').includes(muni));
    row.hidden = !show;
    if (show) visible += 1;
  }
  const counter = document.getElementById('network-count');
  if (counter) counter.textContent = String(visible);
}

function main() {
  const text = document.getElementById('network-text');
  const muni = document.getElementById('network-muni');
  if (!text && !muni) return;
  text?.addEventListener('input', apply);
  muni?.addEventListener('change', apply);
  apply();
}

main();
