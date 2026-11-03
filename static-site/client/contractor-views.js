/**
 * OG-V1: Three restored static views, with bookmarkable client-side filters.
 * Variants are pre-rendered and embedded as JSON. No network requests or inline JS.
 * History has two independent controls: sort and min_lata.
 */
function setupView(name, keyFromParams, defaultKey) {
  const content = document.getElementById(`${name}-content`);
  const embedded = document.getElementById(`${name}-variants`);
  if (!content || !embedded) return;

  let variants;
  try {
    variants = JSON.parse(embedded.textContent || '{}');
  } catch {
    return;
  }
  const hasKey = (key) => Object.prototype.hasOwnProperty.call(variants, key);
  const fallback = hasKey(content.dataset.default) ? content.dataset.default : defaultKey;
  const safeKey = (params) => {
    const requested = keyFromParams(params);
    return hasKey(requested) ? requested : fallback;
  };

  function refreshControls(key) {
    const [activeSort, activeMinYears] = name === 'history' ? key.split('|') : [null, null];
    const links = document.querySelectorAll('.year-chips a[data-variant]');
    for (const link of links) {
      const variant = link.getAttribute('data-variant');
      const group = link.getAttribute('data-variant-group');
      const current = name === 'history'
        ? variant === (group === 'sort' ? activeSort : activeMinYears)
        : variant === key;
      link.setAttribute('aria-current', current ? 'true' : 'false');

      // Keep native open-in-new-tab and copy-link behavior consistent with
      // the current other filter; don't rely only on JS click interception.
      if (name === 'history') {
        const url = new URL(link.getAttribute('href'), window.location.origin);
        url.searchParams.set('sort', group === 'sort' ? variant : activeSort);
        url.searchParams.set('min_lata', group === 'min_lata' ? variant : activeMinYears);
        link.setAttribute('href', url.pathname + url.search);
      }
    }
  }

  function render(key) {
    if (!hasKey(key)) return;
    content.innerHTML = variants[key];
    refreshControls(key);
  }

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey ||
        event.metaKey || event.shiftKey || event.altKey) return;
    const target = event.target;
    const link = target?.closest?.('.year-chips a[data-variant]');
    if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
    const url = new URL(link.href);
    if (url.origin !== window.location.origin || url.pathname !== window.location.pathname) return;
    const key = safeKey(url.searchParams);
    event.preventDefault();
    window.history.pushState({variant:key}, '', url.pathname + url.search + url.hash);
    render(key);
  });

  window.addEventListener('popstate', () => {
    render(safeKey(new URLSearchParams(window.location.search)));
  });
  render(safeKey(new URLSearchParams(window.location.search)));
}

setupView('activity', (params) => params.get('okres') || '90', '90');
setupView('history', (params) => {
  const sort = params.get('sort') || 'streak';
  const min = params.get('min_lata') || '1';
  return `${sort}|${min}`;
}, 'streak|1');
setupView('change', (params) => params.get('okres') || '365', '365');
