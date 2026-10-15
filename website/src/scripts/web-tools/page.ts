import { createUI, element } from './ui';
const root = document.querySelector<HTMLElement>('[data-web-tools]');
if (root) {
  const locale = root.dataset.locale === 'en' ? 'en' : 'zh';
  const ui = createUI(root, locale);
  const theme = element<HTMLSelectElement>(root, '[data-theme]');
  const media = matchMedia('(prefers-color-scheme: dark)');
  const applyTheme = () => { document.body.dataset.themeResolved = theme.value === 'system' ? media.matches ? 'dark' : 'light' : theme.value; };
  try { const saved = localStorage.getItem('zero.web-tools.theme'); if (saved && ['system', 'light', 'dark'].includes(saved)) theme.value = saved; } catch { /* Storage is optional. */ }
  theme.addEventListener('change', () => { try { localStorage.setItem('zero.web-tools.theme', theme.value); } catch { /* Follow the current page selection without storage. */ } applyTheme(); });
  media.addEventListener('change', applyTheme); applyTheme();
  const dialog = element<HTMLDialogElement>(root, '[data-search-dialog]');
  const search = element<HTMLInputElement>(root, '[data-search-input]');
  const opener = element<HTMLButtonElement>(root, '[data-open-search]');
  const links = [...root.querySelectorAll<HTMLAnchorElement>('[data-search-name]')];
  let previous: HTMLElement | null = null;
  const openSearch = () => { previous = document.activeElement instanceof HTMLElement ? document.activeElement : opener; search.value = ''; links.forEach((link) => { link.hidden = false; }); element<HTMLElement>(root, '[data-search-empty]').hidden = true; dialog.showModal(); search.focus(); };
  opener.addEventListener('click', openSearch);
  element(root, '[data-close-search]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { search.value = ''; previous?.focus(); });
  search.addEventListener('input', () => { const term = search.value.trim().toLocaleLowerCase(); for (const link of links) link.hidden = !link.dataset.searchName?.toLocaleLowerCase().includes(term); element<HTMLElement>(root, '[data-search-empty]').hidden = links.some((link) => !link.hidden); });
  dialog.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    const visible = links.filter((link) => !link.hidden);
    const index = visible.findIndex((link) => link === document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const next = event.key === 'ArrowDown' ? (index + 1) % visible.length : (index < 0 ? visible.length - 1 : (index - 1 + visible.length) % visible.length); visible[next]?.focus(); }
    if (event.key === 'Enter' && document.activeElement === search) { event.preventDefault(); visible[0]?.click(); }
  });
  const shortcut = (event: KeyboardEvent) => { if (!event.isComposing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); if (dialog.open) dialog.close(); else openSearch(); } };
  document.addEventListener('keydown', shortcut);
  root.querySelectorAll<HTMLElement>('[data-enhance-only]').forEach((item) => { item.hidden = false; });
  const initialize = async () => {
    if (root.dataset.tool === 'timestamp') {
      (await import('./time')).initTimestamp(ui);
      (await import('./timestamp-batch')).initTimestampBatch(ui);
    }
    else if (root.dataset.tool === 'diff') (await import('./diff')).initDiff(ui);
    else if (root.dataset.tool === 'json' || root.dataset.tool === 'base64') (await import('./processor')).initProcessor(ui, root.dataset.tool);
    const fieldset = root.querySelector<HTMLFieldSetElement>('[data-interactive]'); if (fieldset) fieldset.disabled = false;
    root.dataset.ready = 'true';
  };
  void initialize().catch(() => ui.error({ code: 'worker' }));
  window.addEventListener('pagehide', () => { document.removeEventListener('keydown', shortcut); media.removeEventListener('change', applyTheme); search.value = ''; }, { once: true });
  // Pages restored from the browser cache must not retain tool content or detached listeners.
  window.addEventListener('pageshow', (event) => { if (event.persisted) location.reload(); });
}
