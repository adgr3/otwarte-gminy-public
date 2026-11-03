/**
 * Text filter for the server-rendered lists (contractors, signals).
 *
 * The lists are complete in the HTML, so they are readable and indexable
 * without JavaScript. This only narrows what is already on the page; it never
 * fetches data.
 */
const input = document.querySelector('[data-list-filter]');
const list = document.querySelector('[data-filter-list]');
const status = document.querySelector('[data-list-status]');

if (input && list) {
  const items = [...list.querySelectorAll('[data-filter-item]')];
  const total = items.length;

  const apply = () => {
    const needle = input.value.trim().toLocaleLowerCase('pl');
    let shown = 0;
    for (const item of items) {
      const name = item.getAttribute('data-name') ?? '';
      const match = needle === '' || name.includes(needle);
      item.hidden = !match;
      if (match) shown += 1;
    }
    if (status) {
      status.textContent =
        needle === '' ? '' : `Pokazano ${shown} z ${total} pozycji dla „${input.value.trim()}”.`;
    }
  };

  input.addEventListener('input', apply);
  apply();
}
