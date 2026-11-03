/**
 * Contractor table: interactive sorting + name filter (OG-020).
 *
 * The complete list is already in the HTML (SEO, no-JS). This module only
 * reorders the existing rows and hides non-matching ones; it never fetches.
 *
 * Accessibility:
 *   - every header is a real <button> (Enter/Space work without extra code);
 *   - the active column carries aria-sort="ascending|descending";
 *   - the direction is also announced through a polite live region;
 *   - the current sort is written to ?sort= so it can be linked and reloaded.
 */
import {
  SORT_PARAM,
  ariaSortFor,
  matchesContractorFilter,
  nextContractorSort,
  parseContractorSort,
  sortContractors,
  sortKey,
} from './static-contractors.js';

const table = document.querySelector('[data-contractors-table]');
const body = table?.querySelector('[data-contractor-list]');
const filter = document.querySelector('[data-contractor-filter]');
const sortSelect = document.querySelector('[data-sort-select]');
const status = document.querySelector('[data-contractor-status]');
const announcer = document.querySelector('[data-sort-announcer]');
const headers = table ? [...table.querySelectorAll('th[data-sort-column]')] : [];
const buttons = table ? [...table.querySelectorAll('[data-sort-key]')] : [];

const PARAM_TO_SORT = new Map([
  ['nazwa', 'name'],
  ['pozycje', 'records'],
  ['lata', 'years'],
  ['kwota', 'amount'],
]);
const KEY_LABEL = { name: 'wykonawca', records: 'liczba pozycji', years: 'ostatni rok', amount: 'kwota z rejestru' };

if (table && body) {
  const rows = [...body.querySelectorAll('tr[data-filter-item]')].map((row) => ({
    row,
    name: row.dataset.name ?? '',
    records: row.dataset.records ? Number(row.dataset.records) : 0,
    lastYear: row.dataset.lastYear ? Number(row.dataset.lastYear) : null,
    amount: row.dataset.amount ? Number(row.dataset.amount) : null,
  }));

  const readSortFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get(SORT_PARAM);
    if (!raw) return null;
    // Also accept the Polish aliases: ?sort=pozycje-asc etc.
    const [prefix, ...rest] = raw.split('-');
    const key = PARAM_TO_SORT.get(prefix);
    if (!key) return parseContractorSort(raw);
    const direction = rest.at(-1) === 'asc' ? 'asc' : 'desc';
    return `${key}-${direction}`;
  };

  const writeSortToUrl = (sort) => {
    const url = new URL(window.location.href);
    url.searchParams.set(SORT_PARAM, sort);
    window.history.replaceState({}, '', url);
  };

  const apply = (sort, { announce = false } = {}) => {
    const needle = filter?.value ?? '';
    let shown = 0;
    for (const entry of rows) {
      const match = matchesContractorFilter(entry.name, needle);
      entry.row.hidden = !match;
      if (match) shown += 1;
    }

    const ordered = sortContractors(rows, sort);
    const fragment = document.createDocumentFragment();
    for (const entry of ordered) fragment.append(entry.row);
    body.append(fragment);

    for (const header of headers) {
      const key = header.dataset.sortColumn;
      const aria = ariaSortFor(key, sort);
      if (aria) header.setAttribute('aria-sort', aria);
      else header.removeAttribute('aria-sort');
      header.dataset.active = aria ? 'true' : 'false';
      const button = header.querySelector('[data-sort-key]');
      const indicator = header.querySelector('[data-sort-indicator]');
      if (indicator) {
        indicator.textContent = aria === 'ascending' ? '↑' : aria === 'descending' ? '↓' : '↕';
        indicator.setAttribute('aria-hidden', 'true');
      }
      if (button) {
        const active = aria !== null;
        button.setAttribute('aria-label', active
          ? `Sortowanie: ${KEY_LABEL[key]}, ${aria === 'ascending' ? 'rosnąco' : 'malejąco'}. Kliknij, aby zmienić kierunek.`
          : `Sortuj po: ${KEY_LABEL[key]}.`);
      }
    }

    const activeKey = sortKey(sort);
    const direction = sort.endsWith('-asc') ? 'rosnąco' : 'malejąco';
    if (status) {
      const filterNote = needle.trim() === '' ? '' : `, filtr: „${needle.trim()}”`;
      status.textContent = `Pokazano ${shown} z ${rows.length} wykonawców. Sortowanie: ${KEY_LABEL[activeKey]} ${direction}${filterNote}.`;
    }
    if (announce && announcer) {
      announcer.textContent = `Posortowano po: ${KEY_LABEL[activeKey]}, ${direction}.`;
    }
    if (sortSelect) sortSelect.value = sort;
    writeSortToUrl(sort);
  };

  let sort = readSortFromUrl() ?? parseContractorSort(null);

  for (const button of buttons) {
    button.addEventListener('click', () => {
      sort = nextContractorSort(button.dataset.sortKey, sort);
      apply(sort, { announce: true });
    });
  }

  if (filter) {
    filter.addEventListener('input', () => apply(sort));
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      sort = parseContractorSort(sortSelect.value);
      apply(sort, { announce: true });
    });
  }

  apply(sort);
}
