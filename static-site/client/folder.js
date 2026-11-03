/**
 * Local case folder ("Teczka") for the static site.
 *
 * Mirrors the SSR schema exactly (`otwartegminy.caseFolder.v1`) so a folder a
 * resident built on the old app opens unchanged here. Storage stays in this
 * browser only; nothing is uploaded.
 */
const KEY = 'otwartegminy.caseFolder.v1';
const NOTICE = 'Teczka jest zapisana tylko w tej przeglądarce na tym urządzeniu.';

const empty = () => ({ version: 1, items: [], note: '' });

function parseFolder(raw) {
  if (!raw) return empty();
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1 || !Array.isArray(parsed.items) || typeof parsed.note !== 'string') {
      return empty();
    }
    const items = [];
    for (const item of parsed.items) {
      if (
        item &&
        (item.kind === 'contractor' || item.kind === 'procurement' || item.kind === 'municipality') &&
        typeof item.id === 'string' &&
        typeof item.label === 'string'
      ) {
        items.push({
          kind: item.kind,
          id: item.id,
          label: item.label,
          detail: typeof item.detail === 'string' ? item.detail : null,
          evidenceUrl: typeof item.evidenceUrl === 'string' ? item.evidenceUrl : null,
          addedAt: typeof item.addedAt === 'string' ? item.addedAt : '',
        });
      }
    }
    items.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
    return { version: 1, items, note: parsed.note };
  } catch {
    return empty();
  }
}

export function readFolder() {
  try {
    return parseFolder(localStorage.getItem(KEY));
  } catch {
    return empty();
  }
}

export function writeFolder(folder) {
  const items = [...folder.items].sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  const payload = { version: 1, items, note: folder.note };
  try {
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* storage disabled: the page still works, the folder just does not persist */
  }
  document.dispatchEvent(new CustomEvent('og-folder-changed', { detail: payload }));
  return payload;
}

export function addItem(item) {
  const folder = readFolder();
  if (folder.items.some((i) => i.kind === item.kind && i.id === item.id)) return folder;
  folder.items.push({ ...item, addedAt: new Date().toISOString() });
  writeFolder(folder);
  return folder;
}

export function removeItem(kind, id) {
  const folder = readFolder();
  folder.items = folder.items.filter((i) => !(i.kind === kind && i.id === id));
  writeFolder(folder);
  return folder;
}

export function folderMarkdown(folder, snapshotGeneratedAt) {
  const lines = [];
  lines.push('# OtwarteGminy — teczka (eksport lokalny)');
  lines.push('');
  lines.push(NOTICE);
  lines.push(`Snapshot: ${snapshotGeneratedAt}`);
  lines.push('');
  if (!folder.items.length) {
    lines.push('Brak zapisanych elementów.');
  } else {
    const groups = [
      ['contractor', 'Wykonawcy'],
      ['procurement', 'Postępowania / rekordy źródłowe'],
      ['municipality', 'Gminy'],
    ];
    for (const [kind, title] of groups) {
      const items = folder.items.filter((i) => i.kind === kind);
      if (!items.length) continue;
      lines.push(`## ${title}`);
      lines.push('');
      for (const item of items) {
        lines.push(`- **${item.label}**${item.detail ? ` — ${item.detail}` : ''}`);
        if (item.evidenceUrl) lines.push(`  - źródło: ${item.evidenceUrl}`);
        lines.push(`  - id: \`${item.id}\`${item.addedAt ? ` (dodano ${item.addedAt})` : ''}`);
      }
      lines.push('');
    }
  }
  if (folder.note) {
    lines.push('## Notatka');
    lines.push('');
    lines.push(folder.note);
    lines.push('');
  }
  return lines.join('\n');
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toast(message) {
  let node = document.getElementById('og-folder-toast');
  if (!node) {
    node = document.createElement('div');
    node.id = 'og-folder-toast';
    node.className = 'og2-toast';
    node.setAttribute('role', 'status');
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.classList.add('is-visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove('is-visible'), 2400);
}

function updateCount() {
  const count = readFolder().items.length;
  for (const node of document.querySelectorAll('[data-folder-count]')) {
    node.textContent = String(count);
    node.hidden = count === 0;
  }
}

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function itemLine(item) {
  const url = item.evidenceUrl
    ? ` <a href="${escapeHtml(item.evidenceUrl)}" target="_blank" rel="noopener noreferrer">źródło ↗</a>`
    : '';
  return `<li class="og2-folder-item" data-kind="${escapeHtml(item.kind)}">
    <div><strong>${escapeHtml(item.label)}</strong>${item.detail ? ` — ${escapeHtml(item.detail)}` : ''}${url}</div>
    <button type="button" class="og2-remove" data-folder-remove data-kind="${escapeHtml(item.kind)}" data-id="${escapeHtml(item.id)}" aria-label="Usuń z teczki">Usuń</button>
  </li>`;
}

function renderFolderPage(snapshotDate) {
  const app = document.getElementById('folder-app');
  if (!app) return;
  const folder = readFolder();
  const list = document.getElementById('folder-list');
  const count = document.getElementById('folder-count');
  if (count) count.textContent = String(folder.items.length);
  if (list) {
    if (!folder.items.length) {
      list.innerHTML = '<p class="note">Teczka jest pusta. Dodaj wykonawcę, postępowanie lub gminę przyciskiem „+ Teczka”.</p>';
    } else {
      const groups = [
        ['contractor', 'Wykonawcy'],
        ['procurement', 'Postępowania / rekordy źródłowe'],
        ['municipality', 'Gminy'],
      ];
      list.innerHTML = groups
        .map(([kind, title]) => {
          const items = folder.items.filter((i) => i.kind === kind);
          if (!items.length) return '';
          return `<section><h2>${title}</h2><ul>${items.map(itemLine).join('')}</ul></section>`;
        })
        .join('');
    }
  }
  const note = document.getElementById('folder-note');
  if (note && note.value !== folder.note) note.value = folder.note;
}

function initFolderPage() {
  const app = document.getElementById('folder-app');
  if (!app) return;
  const snapshotDate = app.dataset.snapshot ?? '';
  const note = document.getElementById('folder-note');
  note?.addEventListener('input', () => {
    const folder = readFolder();
    folder.note = note.value;
    writeFolder(folder);
  });
  document.getElementById('folder-md')?.addEventListener('click', () => {
    const folder = readFolder();
    download('teczka-otwartegminy.md', folderMarkdown(folder, snapshotDate), 'text/markdown;charset=utf-8');
  });
  document.getElementById('folder-json')?.addEventListener('click', () => {
    const folder = readFolder();
    download('teczka-otwartegminy.json', JSON.stringify(folder, null, 2), 'application/json;charset=utf-8');
  });
  document.getElementById('folder-copy')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(folderMarkdown(readFolder(), snapshotDate));
      toast('Markdown skopiowany');
    } catch {
      toast('Nie udało się skopiować');
    }
  });
  document.getElementById('folder-clear')?.addEventListener('click', () => {
    if (!confirm('Wyczyścić całą teczkę? Tej operacji nie można cofnąć.')) return;
    writeFolder(empty());
    renderFolderPage(snapshotDate);
    toast('Teczka wyczyszczona');
  });
  document.getElementById('folder-import')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = parseFolder(await file.text());
      writeFolder(parsed);
      renderFolderPage(snapshotDate);
      toast('Teczka zaimportowana');
    } catch {
      toast('Nie udało się odczytać pliku');
    }
  });
  document.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-folder-remove]');
    if (!remove) return;
    removeItem(remove.dataset.kind, remove.dataset.id);
    renderFolderPage(snapshotDate);
  });
  document.addEventListener('og-folder-changed', () => renderFolderPage(snapshotDate));
  renderFolderPage(snapshotDate);
}

export function initFolder() {
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-folder-add]');
    if (!button) return;
    event.preventDefault();
    const item = {
      kind: button.dataset.kind,
      id: button.dataset.id,
      label: button.dataset.label,
      detail: button.dataset.detail || null,
      evidenceUrl: button.dataset.url || null,
    };
    const before = readFolder().items.length;
    addItem(item);
    const after = readFolder().items.length;
    button.textContent = after > before ? 'W teczce ✓' : 'Już w teczce';
    toast(after > before ? 'Dodano do teczki' : 'Ten element jest już w teczce');
  });
  document.addEventListener('og-folder-changed', updateCount);
  updateCount();
}

if (typeof window !== 'undefined') {
  window.__ogFolder = { readFolder, writeFolder, addItem, removeItem, folderMarkdown, CASE_FOLDER_KEY: KEY, NOTICE };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initFolder();
      initFolderPage();
    }, { once: true });
  } else {
    initFolder();
    initFolderPage();
  }
}
