/**
 * Browser driver for the static-first register.
 *
 * Everything here runs AFTER the page is delivered. The Worker never renders:
 * it only checks the password and returns a file. Filtering, searching,
 * sorting and pagination happen in this module, on the same rows and with the
 * same rules as lib/static-registry.js (which the Node parity tests use).
 */
import {
  COL,
  SORT_LABELS,
  SORT_OPTIONS,
  filterRows,
  formatAmount,
  formatDate,
  hrefWith,
  monthLabel,
  parseQuery,
  sourceLabel,
  stateLabel,
  statedCurrencyCode,
} from './static-registry.js';

const $ = (id) => document.getElementById(id);

const els = {
  form: $('filters'),
  status: $('register-status'),
  summary: $('register-summary'),
  results: $('register-results'),
  pagination: $('register-pagination'),
  year: $('rok'),
  month: $('miesiac'),
  unit: $('jednostka'),
  amountState: $('kwotaStan'),
  currency: $('waluta'),
  sort: $('sort'),
};

const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const amountCell = (row) => {
  const amount = row[COL.amount];
  if (amount === null || amount === undefined) {
    return `<span class="amount missing">${esc(stateLabel(row[COL.amountState] ?? 'UNKNOWN'))}</span>`;
  }
  return `<span class="amount">${esc(formatAmount(amount, row[COL.currency]))}</span>`;
};

const rowHtml = (row) => {
  const source = row[COL.source] === 'c' ? 'CRU' : 'BIP';
  const link = row[COL.sourceUrl]
    ? `<a href="${esc(row[COL.sourceUrl])}" target="_blank" rel="noopener noreferrer">źródło ↗</a>`
    : '<span class="muted">brak odnośnika</span>';
  return `<li class="row" data-source="${source}">
  <div class="row-head">
    <span class="date">${esc(formatDate(row[COL.date] ?? row[COL.publicationDate]))}</span>
    <span class="badge badge-${source.toLowerCase()}">${esc(sourceLabel(row[COL.source]))}</span>
    ${amountCell(row)}
  </div>
  <h3 class="row-title">${esc(row[COL.number] ?? 'numer niepodany w rejestrze')}</h3>
  <p class="row-subject">${esc(row[COL.subject] ?? 'przedmiot niepodany')}</p>
  <p class="row-contractor">${esc(row[COL.contractor] ?? 'wykonawca niepodany')}${
    row[COL.status] ? ` <span class="chip">${esc(row[COL.status])}</span>` : ''
  }</p>
  <div class="row-links">${link}</div>
</li>`;
};

function fillSelect(select, options, placeholder) {
  if (!select) return;
  const current = select.value;
  select.replaceChildren();
  if (placeholder) {
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = placeholder;
    select.append(empty);
  }
  for (const option of options) {
    const el = document.createElement('option');
    el.value = String(option.value);
    el.textContent = option.label;
    select.append(el);
  }
  select.value = current;
}

function populateFilters(meta, rows) {
  const normalize = (list, map) =>
    (list ?? [])
      .map((entry) => (entry !== null && typeof entry === 'object' ? map(entry) : { value: entry, label: String(entry) }))
      .filter((entry) => entry.value !== null && entry.value !== undefined);

  fillSelect(
    els.year,
    normalize(meta.years, (entry) => ({ value: entry.value ?? entry.year, label: entry.label ?? String(entry.value ?? entry.year) })),
    'wszystkie lata',
  );
  fillSelect(
    els.month,
    normalize(meta.months, (entry) => ({
      value: entry.value ?? entry.month,
      label: entry.label ?? monthLabel(entry.value ?? entry.month),
    })),
    'wszystkie miesiące',
  );
  fillSelect(
    els.unit,
    normalize(meta.units, (entry) => ({
      value: entry.value ?? entry.name ?? entry.unit,
      label: entry.label ?? entry.officialName ?? entry.name ?? entry.unit,
    })),
    'wszystkie jednostki',
  );
  fillSelect(
    els.amountState,
    normalize(meta.amountStates, (entry) => {
      const state = entry.value ?? entry.state;
      const count = typeof entry.count === 'number' ? entry.count : entry.records;
      return { value: state, label: `${stateLabel(state)}${typeof count === 'number' ? ` (${count})` : ''}` };
    }),
    'wszystkie stany',
  );
  const currencies = [...new Set(rows.map((r) => statedCurrencyCode(r[COL.currency])).filter(Boolean))].sort();
  fillSelect(
    els.currency,
    currencies.map((c) => ({ value: c, label: c })),
    'wszystkie waluty',
  );
  fillSelect(
    els.sort,
    SORT_OPTIONS.map((value) => ({ value, label: SORT_LABELS[value] })),
    null,
  );
}

function syncFormFromUrl(params) {
  const form = els.form;
  if (!form) return;
  const mapping = [
    ['zrodlo', 'zrodlo'],
    ['q', 'q'],
    ['rok', 'rok'],
    ['miesiac', 'miesiac'],
    ['jednostka', 'jednostka'],
    ['wykonawca', 'wykonawca'],
    ['kwotaOd', 'kwotaOd'],
    ['kwotaDo', 'kwotaDo'],
    ['kwotaStan', 'kwotaStan'],
    ['waluta', 'waluta'],
    ['sort', 'sort'],
  ];
  for (const [param, name] of mapping) {
    const field = form.elements.namedItem(name);
    if (!field) continue;
    const value = params.get(param);
    field.value = value ?? '';
  }
  if (els.sort && !params.get('sort')) els.sort.value = 'date-desc';
}

function render(query, result, rows, meta) {
  if (els.results) els.results.innerHTML = result.items.map(rowHtml).join('\n');
  if (els.summary) {
    const parts = [
      `${result.total.toLocaleString('pl-PL')} z ${rows.length.toLocaleString('pl-PL')} rekordów`,
      `strona ${result.page} z ${result.pages}`,
    ];
    if (query.source !== 'all') parts.push(`źródło: ${sourceLabel(query.source === 'bip' ? 'b' : 'c')}`);
    if (query.q) parts.push(`szukane: „${query.q}”`);
    if (query.year !== null && query.year !== undefined) parts.push(`rok ${query.year}`);
    if (query.month !== null && query.month !== undefined) parts.push(monthLabel(query.month));
    els.summary.textContent = `${parts.join(' · ')}.`;
  }
  if (els.status) {
    els.status.textContent = `Dane wczytane: ${rows.length.toLocaleString('pl-PL')} rekordów, generacja ${(meta.generationId ?? '').slice(0, 12)}.`;
  }
  renderPagination(query, result);
}

function renderPagination(query, result) {
  if (!els.pagination) return;
  const params = new URLSearchParams(window.location.search);
  els.pagination.replaceChildren();
  const add = (label, page, disabled) => {
    if (disabled) {
      const span = document.createElement('span');
      span.className = 'muted';
      span.textContent = label;
      els.pagination.append(span);
      return;
    }
    const link = document.createElement('a');
    link.href = hrefWith(params, { strona: page === 1 ? null : page });
    link.textContent = label;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const url = new URL(window.location.href);
      if (page === 1) url.searchParams.delete('strona');
      else url.searchParams.set('strona', String(page));
      navigate(url);
    });
    els.pagination.append(link);
  };
  if (result.page > 1) add('← poprzednia', result.page - 1, false);
  add(`strona ${result.page} z ${result.pages}`, 1, true);
  if (result.page < result.pages) add('następna →', result.page + 1, false);
}

let state = null;

function navigate(url) {
  window.history.pushState({}, '', url);
  apply();
}

function apply() {
  if (!state) return;
  const params = new URLSearchParams(window.location.search);
  syncFormFromUrl(params);
  const query = parseQuery(params);
  const result = filterRows(state.rows, query);
  render(query, result, state.rows, state.meta);
}

async function loadJson(path) {
  const response = await fetch(path, { credentials: 'same-origin', headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

async function boot() {
  if (!els.form || !els.results) return;
  try {
    const [meta, data] = await Promise.all([loadJson('/data/meta.json'), loadJson('/data/registry.json')]);
    state = { meta, rows: data.rows };
    if (data.generationId !== meta.generationId) {
      throw new Error('generation mismatch between meta.json and registry.json');
    }
    populateFilters(meta, data.rows);
    apply();

    els.form.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(els.form);
      const next = new URLSearchParams();
      for (const [key, value] of formData.entries()) {
        const text = String(value).trim();
        if (text !== '') next.set(key, text);
      }
      const url = new URL(window.location.href);
      url.search = next.toString();
      navigate(url);
    });
    window.addEventListener('popstate', apply);
  } catch (error) {
    if (els.status) {
      els.status.textContent = `Nie udało się wczytać danych rejestru: ${String(error.message ?? error)}`;
      els.status.setAttribute('role', 'alert');
    }
  }
}

boot();
