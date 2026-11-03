/**
 * `/porownaj/` — client-side municipality comparison.
 *
 * Uses the public multi-municipality snapshot that already ships with the site.
 * No data is invented: every number comes from snapshot.json / network.json /
 * data_quality.json, and the page states which snapshot it is reading.
 */
const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const int = (value) => (value === null || value === undefined ? '—' : Number(value).toLocaleString('pl-PL'));
const date = (value) => (value ? new Date(`${String(value).slice(0, 10)}T12:00:00Z`).toLocaleDateString('pl-PL') : '—');

let cache = null;

async function load() {
  if (cache) return cache;
  const [snapshot, network, quality] = await Promise.all([
    fetch('/data/multi/snapshot.json').then((r) => (r.ok ? r.json() : null)),
    fetch('/data/multi/network.json').then((r) => (r.ok ? r.json() : null)),
    fetch('/data/multi/quality.json').then((r) => (r.ok ? r.json() : null)),
  ]);
  if (!snapshot || !network || !quality) throw new Error('missing multi-municipality dataset');
  cache = { snapshot, network, quality, byId: new Map(snapshot.municipalities.map((m) => [m.id, m])) };
  return cache;
}

function pairFromUrl(data) {
  const params = new URLSearchParams(location.search);
  const ids = data.snapshot.municipalities.map((m) => m.id);
  const fallbackA = ids.includes('piaseczno-1418043') ? 'piaseczno-1418043' : ids[0];
  const fallbackB = ids.includes('lesznowola-1418032') ? 'lesznowola-1418032' : ids[1] ?? ids[0];
  const a = ids.includes(params.get('a')) ? params.get('a') : fallbackA;
  const b = ids.includes(params.get('b')) ? params.get('b') : fallbackB;
  return { a, b };
}

function summaryCard(data, id, side) {
  const muni = data.byId.get(id);
  const q = data.quality.municipalities?.[id] ?? {};
  if (!muni) return `<article class="og2-card"><p>Nieznana gmina <code>${esc(id)}</code>.</p></article>`;
  const range = Array.isArray(q.date_range) ? `${date(q.date_range[0])} – ${date(q.date_range[1])}` : '—';
  return `<article class="og2-card">
  <p class="og2-eyebrow">Gmina ${side}</p>
  <h3>${esc(muni.name)}</h3>
  <dl class="og2-facts">
    <div><dt>Mieszkańcy</dt><dd>${int(muni.population)}</dd></div>
    <div><dt>Grupa porównawcza</dt><dd>${esc(muni.peerGroup ?? '—')}</dd></div>
    <div><dt>Zakres danych</dt><dd>${esc(range)}</dd></div>
    <div><dt>Rekordy w gminie</dt><dd>${int(q.records_municipal)}</dd></div>
    <div><dt>Z wykonawcą</dt><dd>${int(q.awarded_with_contractor)}</dd></div>
    <div><dt>Unikalni wykonawcy</dt><dd>${int(q.unique_contractors)}</dd></div>
  </dl>
</article>`;
}

function metricRows(data, a, b) {
  const wanted = ['-hhi', '-div', '-win'];
  const rows = [];
  for (const suffix of wanted) {
    const ma = data.snapshot.metrics.find((m) => m.municipalityId === a && m.id.endsWith(suffix));
    const mb = data.snapshot.metrics.find((m) => m.municipalityId === b && m.id.endsWith(suffix));
    if (!ma && !mb) continue;
    const ref = ma ?? mb;
    const fmt = (m) => (m ? `${Number(m.value).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} <span class="muted">(n=${int(m.sampleSize)})</span>` : '—');
    const peer = ref?.comparison
      ? `${Number(ref.comparison.value).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} <span class="muted">(${esc(ref.comparison.peerGroup ?? 'grupa')}, n=${int(ref.comparison.sampleSize)})</span>`
      : '—';
    rows.push(`<tr><th scope="row">${esc(ref?.label ?? suffix)}</th><td>${fmt(ma)}</td><td>${fmt(mb)}</td><td>${peer}</td></tr>`);
  }
  return rows.join('') || '<tr><td colspan="4">Brak metryk dla tej pary.</td></tr>';
}

function sharedContractors(data, a, b) {
  const pairs = (data.network.aggregates ?? []).filter(
    (agg) => Array.isArray(agg.municipalities) && agg.municipalities.includes(a) && agg.municipalities.includes(b),
  );
  if (!pairs.length) {
    return '<p class="note">Ta para gmin nie ma wspólnych wykonawców w publicznym zbiorze (to nie znaczy, że nie istnieją — zbiór obejmuje BZP i jest ograniczony).</p>';
  }
  const name = (id) => data.byId.get(id)?.name ?? id;
  const edges = (key, muniId) =>
    (data.network.edges ?? [])
      .filter((e) => e.contractor_name_key === key && e.municipality_slug === muniId)
      .slice(0, 4);
  return `<ol class="og2-shared">${pairs
    .sort((x, y) => (y.procurement_count ?? 0) - (x.procurement_count ?? 0))
    .map((agg) => {
      const items = [a, b]
        .map((id) => {
          const list = edges(agg.contractor_name_key, id);
          if (!list.length) return '';
          return `<div class="og2-side"><h4>${esc(name(id))}</h4><ul>${list
            .map(
              (e) =>
                `<li><a href="${esc(e.source_url)}" target="_blank" rel="noopener noreferrer">${esc(e.procurement_title ?? e.procurement_id)}</a> <span class="muted">${esc(e.date ?? '')}</span></li>`,
            )
            .join('')}</ul></div>`;
        })
        .join('');
      return `<li class="og2-shared-item"><h3>${esc(agg.contractor_name)}</h3>
      <p class="note">${int(agg.municipality_count)} gmin · ${int(agg.procurement_count)} postępowań${agg.first_seen ? ` · ${esc(agg.first_seen)} – ${esc(agg.last_seen ?? '')}` : ''}</p>
      <div class="og2-sides">${items}</div></li>`;
    })
    .join('')}</ol>`;
}

function render(data) {
  const { a, b } = pairFromUrl(data);
  const root = document.getElementById('compare-root');
  const selectA = document.getElementById('compare-a');
  const selectB = document.getElementById('compare-b');
  if (selectA) selectA.value = a;
  if (selectB) selectB.value = b;
  const ma = data.byId.get(a);
  const mb = data.byId.get(b);
  root.innerHTML = `
  <p class="og2-note">Zestaw wielogminny: <strong>${esc(data.snapshot.generatedAt?.slice(0, 10) ?? '—')}</strong> · ${int(data.snapshot.municipalities.length)} JST · ${int(data.snapshot.procurements.length)} postępowań BZP. To osobny zbiór publiczny od rejestru Pruszkowa; nie mieszamy generacji.</p>
  <div class="og2-grid">${summaryCard(data, a, 'A')}${summaryCard(data, b, 'B')}</div>
  <h2>Metryki</h2>
  <table class="data-table"><thead><tr><th scope="col">Metryka</th><th scope="col">${esc(ma?.name ?? 'A')}</th><th scope="col">${esc(mb?.name ?? 'B')}</th><th scope="col">Grupa porównawcza</th></tr></thead><tbody>${metricRows(data, a, b)}</tbody></table>
  <h2>Wspólni wykonawcy</h2>
  ${sharedContractors(data, a, b)}
  <p class="og2-actions"><button type="button" class="cta" id="compare-export">Pobierz pakiet Markdown</button> <button type="button" class="cta secondary" id="compare-copy">Kopiuj link</button></p>`;

  document.getElementById('compare-export')?.addEventListener('click', () => {
    const lines = [
      `# Porównanie gmin: ${ma?.name ?? a} vs ${mb?.name ?? b}`,
      '',
      `Snapshot wielogminny: ${data.snapshot.generatedAt ?? '—'}`,
      '',
      `- ${ma?.name ?? a}: ${data.quality.municipalities?.[a]?.records_municipal ?? '—'} rekordów, ${data.quality.municipalities?.[a]?.awarded_with_contractor ?? '—'} z wykonawcą`,
      `- ${mb?.name ?? b}: ${data.quality.municipalities?.[b]?.records_municipal ?? '—'} rekordów, ${data.quality.municipalities?.[b]?.awarded_with_contractor ?? '—'} z wykonawcą`,
      '',
      '## Metryki',
      ...data.snapshot.metrics
        .filter((m) => (m.municipalityId === a || m.municipalityId === b) && /-(hhi|div|win)$/.test(m.id))
        .map((m) => `- ${m.label} · ${data.byId.get(m.municipalityId)?.name ?? m.municipalityId}: ${m.value} (n=${m.sampleSize})`),
      '',
      'Dane publiczne z BZP (z-dykty.pl, CC BY 4.0). Zestaw obejmuje najnowsze 100 postępowań na gminę; nie jest pełnym rejestrem.',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pakiet-porownanie-${a}--${b}.md`;
    link.click();
    URL.revokeObjectURL(url);
  });
  document.getElementById('compare-copy')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      document.getElementById('compare-copy').textContent = 'Skopiowano ✓';
    } catch {
      document.getElementById('compare-copy').textContent = 'Nie udało się skopiować';
    }
  });
}

async function main() {
  const root = document.getElementById('compare-root');
  if (!root) return;
  try {
    const data = await load();
    for (const id of ['compare-a', 'compare-b']) {
      document.getElementById(id)?.addEventListener('change', () => {
        const a = document.getElementById('compare-a')?.value;
        const b = document.getElementById('compare-b')?.value;
        const params = new URLSearchParams(location.search);
        params.set('a', a);
        params.set('b', b);
        history.replaceState(null, '', `${location.pathname}?${params}`);
        render(data);
      });
    }
    render(data);
  } catch (error) {
    root.innerHTML = `<p class="og2-error">Zestaw wielogminny jest chwilowo niedostępny (${esc(error.message)}). Rejestr Pruszkowa działa normalnie.</p>`;
  }
}

main();
