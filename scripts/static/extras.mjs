/**
 * Server-rendered pages for the features the static release must keep:
 * `/porownaj/`, `/teczka/`, `/okna-ofertowe/` and `/siec-wykonawcow/`.
 *
 * Everything here is derived from the public multi-municipality snapshot that
 * ships with the repository (`data/public/{snapshot,network,data_quality}.json`).
 * That snapshot is a *separate* public generation from the Pruszków BIP/CRU
 * registry; the pages say so instead of implying one merged dataset.
 */

export function bidWindowDays(publicationDate, bidDeadline) {
  if (!publicationDate || !bidDeadline) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publicationDate)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bidDeadline)) return null;
  const a = Date.parse(`${publicationDate}T12:00:00Z`);
  const b = Date.parse(`${bidDeadline}T12:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

const DEFAULT_A = 'piaseczno-1418043';
const DEFAULT_B = 'lesznowola-1418032';

function municipalityOptions(municipalities, selected) {
  return [...municipalities]
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pl'))
    .map(
      (m) =>
        `<option value="${m.id}"${m.id === selected ? ' selected' : ''}>${m.name}</option>`,
    )
    .join('');
}

function fmt(value, digits = 1) {
  if (value === null || value === undefined || value === '') return '—';
  return Number(value).toLocaleString('pl-PL', { maximumFractionDigits: digits });
}

function summaryCard({ esc, int, dateLabel, byId, quality }, id, side) {
  const muni = byId.get(id);
  const q = quality?.municipalities?.[id] ?? {};
  if (!muni) return `<article class="og2-card"><p>Nieznana gmina <code>${esc(id)}</code>.</p></article>`;
  const range = Array.isArray(q.date_range) ? `${dateLabel(q.date_range[0])} – ${dateLabel(q.date_range[1])}` : '—';
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

function metricRows({ esc, int, snapshot }, a, b) {
  const rows = [];
  for (const suffix of ['-hhi', '-div', '-win']) {
    const ma = snapshot.metrics.find((m) => m.municipalityId === a && m.id.endsWith(suffix));
    const mb = snapshot.metrics.find((m) => m.municipalityId === b && m.id.endsWith(suffix));
    if (!ma && !mb) continue;
    const ref = ma ?? mb;
    const cell = (m) => (m ? `${fmt(m.value)} <span class="muted">(n=${int(m.sampleSize)})</span>` : '—');
    const peer = ref?.comparison
      ? `${fmt(ref.comparison.value)} <span class="muted">(${esc(ref.comparison.peerGroup ?? 'grupa')}, n=${int(ref.comparison.sampleSize)})</span>`
      : '—';
    rows.push(
      `<tr><th scope="row">${esc(ref?.label ?? suffix)}</th><td>${cell(ma)}</td><td>${cell(mb)}</td><td>${peer}</td></tr>`,
    );
  }
  return rows.join('') || '<tr><td colspan="4">Brak metryk dla tej pary.</td></tr>';
}

function sharedContractors({ esc, int, byId, network }, a, b) {
  const pairs = (network.aggregates ?? []).filter(
    (agg) => Array.isArray(agg.municipalities) && agg.municipalities.includes(a) && agg.municipalities.includes(b),
  );
  if (!pairs.length) {
    return '<p class="note">Ta para gmin nie ma wspólnych wykonawców w publicznym zbiorze (to nie znaczy, że nie istnieją — zbiór obejmuje BZP i jest ograniczony).</p>';
  }
  return `<ol class="og2-shared">${pairs
    .sort((x, y) => (y.procurement_count ?? 0) - (x.procurement_count ?? 0))
    .map((agg) => {
      const sides = [a, b]
        .map((id) => {
          const list = (network.edges ?? [])
            .filter((e) => e.contractor_name_key === agg.contractor_name_key && e.municipality_slug === id)
            .slice(0, 4);
          if (!list.length) return '';
          return `<div class="og2-side"><h4>${esc(byId.get(id)?.name ?? id)}</h4><ul>${list
            .map(
              (e) =>
                `<li><a href="${esc(e.source_url)}" target="_blank" rel="noopener noreferrer">${esc(e.procurement_title ?? e.procurement_id)}</a> <span class="muted">${esc(e.date ?? '')}</span></li>`,
            )
            .join('')}</ul></div>`;
        })
        .join('');
      return `<li class="og2-shared-item"><h3>${esc(agg.contractor_name)}</h3>
      <p class="note">${int(agg.municipality_count)} gmin · ${int(agg.procurement_count)} postępowań${agg.first_seen ? ` · ${esc(agg.first_seen)} – ${esc(agg.last_seen ?? '')}` : ''}</p>
      <div class="og2-sides">${sides}</div></li>`;
    })
    .join('')}</ol>`;
}

export function comparePage({ layout, esc, int, dateLabel, snapshot, network, quality }) {
  const byId = new Map(snapshot.municipalities.map((m) => [m.id, m]));
  const ids = [...byId.keys()];
  const a = ids.includes(DEFAULT_A) ? DEFAULT_A : ids[0];
  const b = ids.includes(DEFAULT_B) ? DEFAULT_B : ids[1] ?? ids[0];
  const ctx = { esc, int, dateLabel, byId, quality, snapshot, network };
  const body = `<section class="panel">
  <p class="eyebrow">Otwarte Gminy · Porównanie</p>
  <h1>Porównaj gminy</h1>
  <p class="lead">Zestawienie dwóch gmin z publicznego zbioru wielogminnego: liczba postępowań, wykonawcy,
  koncentracja i wspólne firmy. Wybierz gminy poniżej — adres jest współdzielny.</p>
  <p class="og2-note">Zestaw wielogminny: <strong>${esc(snapshot.generatedAt?.slice(0, 10) ?? '—')}</strong> ·
  ${int(snapshot.municipalities.length)} JST · ${int(snapshot.procurements.length)} postępowań BZP.
  To osobny zbiór publiczny od rejestru Pruszkowa; nie mieszamy generacji.</p>
  <div class="og2-selects">
    <label>Gmina A <select id="compare-a" data-compare-select>${municipalityOptions(snapshot.municipalities, a)}</select></label>
    <label>Gmina B <select id="compare-b" data-compare-select>${municipalityOptions(snapshot.municipalities, b)}</select></label>
  </div>
  <div id="compare-root">
    <div class="og2-grid">${summaryCard(ctx, a, 'A')}${summaryCard(ctx, b, 'B')}</div>
    <h2>Metryki</h2>
    <table class="data-table"><thead><tr><th scope="col">Metryka</th><th scope="col">${esc(byId.get(a)?.name)}</th><th scope="col">${esc(byId.get(b)?.name)}</th><th scope="col">Grupa porównawcza</th></tr></thead><tbody>${metricRows(ctx, a, b)}</tbody></table>
    <h2>Wspólni wykonawcy</h2>
    ${sharedContractors(ctx, a, b)}
    <p class="og2-actions"><button type="button" class="cta" id="compare-export">Pobierz pakiet Markdown</button> <button type="button" class="cta secondary" id="compare-copy">Kopiuj link</button></p>
  </div>
  <noscript><p class="note">Bez JavaScriptu widzisz domyślną parę. Przełączanie gmin wymaga JavaScriptu; dane i tak pochodzą z publicznego snapshotu.</p></noscript>
</section>`;
  return layout({
    title: 'Porównaj gminy — Otwarte Gminy',
    description: 'Porównanie dwóch gmin z publicznego zbioru wielogminnego: postępowania, wykonawcy, koncentracja.',
    active: 'porownaj',
    path: '/porownaj/',
    extraScripts: ['/assets/compare.js'],
    body,
  });
}

export function tendersPage({ layout, esc, int, dateLabel, snapshot }) {
  const byId = new Map(snapshot.municipalities.map((m) => [m.id, m]));
  const evidence = new Map((snapshot.evidence ?? []).map((e) => [e.id, e]));
  const rows = (snapshot.procurements ?? [])
    .map((p) => ({ p, days: bidWindowDays(p.publicationDate, p.bidDeadline) }))
    .filter((row) => row.days !== null)
    .sort((x, y) => x.days - y.days || String(x.p.municipalityId).localeCompare(String(y.p.municipalityId)));
  const evidenceUrl = (p) => {
    const ref = (p.evidenceRefs ?? [])[0];
    return (ref && evidence.get(ref)?.url) || null;
  };
  const body = `<section class="panel">
  <p class="eyebrow">Otwarte Gminy · Okna ofertowe</p>
  <h1>Okna ofertowe</h1>
  <p class="lead">Czas między publikacją postępowania a terminem składania ofert — krótkie okna utrudniają udział
  mniejszym firmom. Poniżej ${int(rows.length)} postępowań z obiema datami w publicznym zbiorze BZP.</p>
  <p class="og2-note">Zestaw wielogminny: <strong>${esc(snapshot.generatedAt?.slice(0, 10) ?? '—')}</strong> ·
  ${int(snapshot.municipalities.length)} JST. To osobny zbiór publiczny od rejestru Pruszkowa.</p>
  <p class="og2-filter"><label>Pokaż okna do <input type="number" id="tenders-max" min="0" step="1" inputmode="numeric"> dni</label>
  <span class="muted">widocznych: <strong id="tenders-count">${rows.length}</strong></span></p>
  <table class="data-table og2-tenders">
    <caption>Postępowania z terminem składania ofert (sortowane od najkrótszego okna)</caption>
    <thead><tr><th scope="col">Dni</th><th scope="col">Gmina</th><th scope="col">Postępowanie</th><th scope="col">Publikacja</th><th scope="col">Termin</th><th scope="col">Teczka</th></tr></thead>
    <tbody>
    ${rows
      .map(({ p, days }) => {
        const url = evidenceUrl(p);
        const title = url
          ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(p.title)}</a>`
          : esc(p.title);
        return `<tr data-window-days="${days}" data-municipality="${esc(p.municipalityId)}">
        <td><strong>${int(days)}</strong></td>
        <td>${esc(byId.get(p.municipalityId)?.name ?? p.municipalityId)}</td>
        <td>${title}</td>
        <td>${esc(p.publicationDate)}</td>
        <td>${esc(p.bidDeadline)}</td>
        <td><button type="button" class="og2-add" data-folder-add data-kind="procurement" data-id="${esc(p.id)}" data-label="${esc(p.title)}" data-detail="${esc(byId.get(p.municipalityId)?.name ?? '')}" data-url="${esc(url ?? '')}">+ Teczka</button></td>
      </tr>`;
      })
      .join('')}
    </tbody>
  </table>
  <p class="note">Zbiór obejmuje najnowsze 100 postępowań na gminę; nie wszystkie postępowania mają obie daty.
  Brak daty nie jest traktowany jako zero.</p>
</section>`;
  return layout({
    title: 'Okna ofertowe — Otwarte Gminy',
    description: 'Czas między publikacją postępowania a terminem składania ofert w publicznym zbiorze BZP.',
    active: 'okna',
    path: '/okna-ofertowe/',
    extraScripts: ['/assets/tenders.js'],
    body,
  });
}

export function folderPage({ layout, esc, snapshot }) {
  const body = `<section class="panel">
  <p class="eyebrow">Otwarte Gminy · Teczka</p>
  <h1>Teczka sprawy</h1>
  <p class="lead">Zbieraj wykonawców, postępowania i gminy w jednym miejscu, a potem pobierz notatkę jako
  Markdown lub JSON. Teczka zostaje w tej przeglądarce — nic nie jest wysyłane na serwer.</p>
  <p class="og2-note">Snapshot wielogminny: <strong>${esc(snapshot?.generatedAt?.slice(0, 10) ?? '—')}</strong>.
  Elementy dodajesz przyciskami „+ Teczka” na stronach wykonawców, rejestru i okien ofertowych.</p>
  <div id="folder-app" data-snapshot="${esc(snapshot?.generatedAt ?? '')}">
    <p class="og2-folder-count">Zapisane elementy: <strong id="folder-count">0</strong></p>
    <div id="folder-list" class="og2-folder-list"></div>
    <label class="og2-note-label">Notatka do teczki
      <textarea id="folder-note" rows="4" placeholder="Kontekst, pytania, numer sprawy…"></textarea>
    </label>
    <p class="og2-actions">
      <button type="button" class="cta" id="folder-md">Pobierz Markdown</button>
      <button type="button" class="cta secondary" id="folder-json">Pobierz JSON</button>
      <button type="button" class="cta secondary" id="folder-copy">Kopiuj Markdown</button>
      <button type="button" class="cta danger" id="folder-clear">Wyczyść teczkę</button>
    </p>
    <p class="note">Importujesz teczkę z innego urządzenia? <input type="file" id="folder-import" accept="application/json,.json"></p>
  </div>
</section>`;
  return layout({
    title: 'Teczka sprawy — Otwarte Gminy',
    description: 'Lokalna teczka: wykonawcy, postępowania i gminy w tej przeglądarce, z eksportem Markdown i JSON.',
    active: 'teczka',
    path: '/teczka/',
    extraScripts: ['/assets/folder.js'],
    body,
  });
}

export function networkPage({ layout, esc, int, dateLabel, snapshot, network }) {
  const byId = new Map(snapshot.municipalities.map((m) => [m.id, m]));
  const multi = (network.aggregates ?? [])
    .filter((agg) => (agg.municipality_count ?? 0) > 1)
    .sort(
      (a, b) =>
        (b.municipality_count ?? 0) - (a.municipality_count ?? 0) ||
        (b.procurement_count ?? 0) - (a.procurement_count ?? 0),
    );
  const muniIds = [...new Set(multi.flatMap((agg) => agg.municipalities ?? []))]
    .map((id) => byId.get(id))
    .filter(Boolean)
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pl'));
  const body = `<section class="panel">
  <p class="eyebrow">Otwarte Gminy · Sieć wykonawców</p>
  <h1>Wykonawcy w wielu gminach</h1>
  <p class="lead">${int(multi.length)} wykonawców pojawia się w więcej niż jednej gminie w publicznym zbiorze BZP.
  Tabela pokazuje zasięg, liczbę postępowań i zakres dat. To sygnał do sprawdzenia, nie dowód powiązań.</p>
  <p class="og2-note">Zestaw wielogminny: <strong>${esc(snapshot.generatedAt?.slice(0, 10) ?? '—')}</strong> ·
  ${int(snapshot.municipalities.length)} JST · ${int(snapshot.procurements.length)} postępowań.
  Osobny zbiór publiczny od rejestru Pruszkowa.</p>
  <div class="og2-selects">
    <label>Szukaj wykonawcy <input type="search" id="network-text" placeholder="nazwa…"></label>
    <label>Gmina <select id="network-muni"><option value="">Wszystkie</option>${muniIds
      .map((m) => `<option value="${esc(m.id)}">${esc(m.name)}</option>`)
      .join('')}</select></label>
  </div>
  <p class="muted">Widocznych: <strong id="network-count">${multi.length}</strong></p>
  <table class="data-table">
    <caption>Wykonawcy obecni w więcej niż jednej gminie</caption>
    <thead><tr><th scope="col">Wykonawca</th><th scope="col">Gminy</th><th scope="col">Postępowania</th><th scope="col">Zakres</th><th scope="col">Teczka</th></tr></thead>
    <tbody>
    ${multi
      .map((agg) => {
        const names = (agg.municipalities ?? []).map((id) => byId.get(id)?.name ?? id);
        const search = `${agg.contractor_name} ${names.join(' ')}`.toLowerCase();
        return `<tr data-network-row data-search="${esc(search)}" data-municipalities="${esc((agg.municipalities ?? []).join(' '))}">
        <td><strong>${esc(agg.contractor_name)}</strong>${agg.contractor_identity_status === 'name_only_unresolved' ? ' <span class="chip">tylko nazwa</span>' : ''}</td>
        <td>${int(agg.municipality_count)}</td>
        <td>${int(agg.procurement_count)}</td>
        <td>${esc(names.join(', '))}${agg.first_seen ? `<br><span class="muted">${esc(agg.first_seen)} – ${esc(agg.last_seen ?? '')}</span>` : ''}</td>
        <td><button type="button" class="og2-add" data-folder-add data-kind="contractor" data-id="${esc(agg.contractor_name_key)}" data-label="${esc(agg.contractor_name)}" data-detail="${esc(names.join(', '))}" data-url="">+ Teczka</button></td>
      </tr>`;
      })
      .join('')}
    </tbody>
  </table>
  <p class="note">Tożsamość wykonawcy jest dopasowana po nazwie (brak NIP w publicznym zbiorze), więc dwa podobne
  podmioty mogą zostać połączone. Oznaczenie „tylko nazwa” jest widoczne w tabeli.</p>
</section>`;
  return layout({
    title: 'Sieć wykonawców — Otwarte Gminy',
    description: 'Wykonawcy obecni w więcej niż jednej gminie w publicznym zbiorze BZP.',
    active: 'siec',
    path: '/siec-wykonawcow/',
    extraScripts: ['/assets/network.js'],
    body,
  });
}

export function extrasTeaser({ esc, int, network }) {
  const multi = (network.aggregates ?? [])
    .filter((agg) => (agg.municipality_count ?? 0) > 1)
    .sort((a, b) => (b.municipality_count ?? 0) - (a.municipality_count ?? 0))
    .slice(0, 3);
  if (!multi.length) return '';
  return `<section class="panel">
  <h2>Wykonawcy w wielu gminach</h2>
  <p class="note">${int((network.aggregates ?? []).filter((agg) => (agg.municipality_count ?? 0) > 1).length)}
  wykonawców z publicznego zbioru BZP działa w więcej niż jednej gminie.
  <a href="/siec-wykonawcow/">Zobacz całą sieć →</a></p>
  <ul class="cards">
  ${multi
    .map(
      (agg) =>
        `<li class="card"><h3>${esc(agg.contractor_name)}</h3><p>${int(agg.municipality_count)} gmin · ${int(agg.procurement_count)} postępowań</p></li>`,
    )
    .join('')}
  </ul>
</section>`;
}
