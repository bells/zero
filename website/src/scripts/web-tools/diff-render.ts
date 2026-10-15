import type { DiffValue } from '../../lib/web-tools/text-diff-types';
import { diffWindow, type DiffCursor, type VisibleDiffLine } from '../../lib/web-tools/text-diff-window';
import type { DiffCopy } from './diff-copy';
import { element } from './ui';
export function createDiffRenderer(root: HTMLElement, c: DiffCopy) {
  const area = element<HTMLElement>(root, '[data-diff-result]');
  const documentArea = element<HTMLElement>(root, '[data-diff-document]');
  const view = element<HTMLSelectElement>(root, '[data-diff-view]');
  const previous = element<HTMLButtonElement>(root, '[data-diff-previous]');
  const next = element<HTMLButtonElement>(root, '[data-diff-next]');
  const previousPage = element<HTMLButtonElement>(root, '[data-diff-page-previous]');
  const nextPage = element<HTMLButtonElement>(root, '[data-diff-page-next]');
  const position = element<HTMLOutputElement>(root, '[data-diff-position]');
  const listeners = new AbortController();
  let value: DiffValue | undefined, current = 0, cursor: DiffCursor = { row: 0, offset: 0 }, following: DiffCursor | undefined;
  let history: { cursor: DiffCursor; inspect: boolean }[] = [], inspect = false;
  view.value = matchMedia('(max-width: 720px)').matches ? 'unified' : 'split';
  const text = (tag: string, content: string, className?: string) => { const node = document.createElement(tag); node.textContent = content; if (className) node.className = className; return node; };
  const line = (item: VisibleDiffLine, side: 'before' | 'after' | 'unified') => {
    const absent = side === 'before' && item.kind === 'added' || side === 'after' && item.kind === 'deleted';
    const node = document.createElement('div');
    node.className = `diff-line diff-${absent ? 'placeholder' : item.kind}`;
    if (absent) { node.setAttribute('aria-hidden', 'true'); return node; }
    node.dataset.diffTextRow = '';
    node.dataset.diffRow = String(item.row);
    const marker = item.kind === 'added' ? '+' : item.kind === 'deleted' ? '−' : ' ';
    node.setAttribute('aria-label', `${c[item.kind]} ${side === 'before' ? item.beforeLine : side === 'after' ? item.afterLine : `${item.beforeLine ?? ''} / ${item.afterLine ?? ''}`}`);
    if (side !== 'after') node.append(text('span', item.beforeLine === null ? '' : String(item.beforeLine), 'diff-gutter'));
    if (side !== 'before') node.append(text('span', item.afterLine === null ? '' : String(item.afterLine), 'diff-gutter'));
    node.append(text('span', marker, 'diff-marker'));
    const content = document.createElement('code'); content.className = 'diff-text'; content.dataset.diffSourceText = '';
    for (const segment of item.segments) content.append(text('span', segment.text, segment.changed ? 'diff-highlight' : undefined));
    node.append(content);
    if (item.noNewline) node.append(text('span', `↵ ${c.noNewline}`, 'diff-line-note'));
    if (item.continued) node.append(text('span', `… ${c.continued}`, 'diff-line-note'));
    return node;
  };
  const render = (targetRow?: number) => {
    if (!value) return;
    area.hidden = false;
    const window = diffWindow(value, cursor, inspect, targetRow); following = window.next;
    if (window.cursor.row !== cursor.row || window.cursor.offset !== cursor.offset) {
      history.push({ cursor: { ...cursor }, inspect }); cursor = window.cursor;
    }
    const split = view.value === 'split';
    documentArea.replaceChildren(); documentArea.classList.toggle('diff-split', split);
    const sides = split ? ['before', 'after'] as const : ['unified'] as const;
    const panes: HTMLElement[] = [];
    for (const side of sides) {
      const pane = document.createElement('div'); pane.className = 'diff-pane'; pane.tabIndex = 0;
      pane.setAttribute('role', 'region'); pane.setAttribute('aria-label', side === 'unified' ? c.unified : c[side]);
      pane.append(text('div', side === 'unified' ? `${c.before} / ${c.after}` : c[side], 'diff-pane-title'));
      for (const item of window.items) {
        if (item.type === 'line') pane.append(line(item, side));
        else {
          const fold = document.createElement('div'); fold.className = 'diff-fold';
          const button = document.createElement('button'); button.type = 'button'; button.textContent = c.omitted(item.count);
          button.addEventListener('click', () => { history.push({ cursor: { ...cursor }, inspect }); cursor = { row: item.row, offset: 0 }; inspect = true; render(); documentArea.focus(); });
          fold.append(button); pane.append(fold);
        }
      }
      panes.push(pane); documentArea.append(pane);
    }
    if (split) {
      let syncing = false;
      for (const pane of panes) pane.addEventListener('scroll', () => {
        if (syncing) return;
        const other = panes.find(candidate => candidate !== pane);
        if (other && other.scrollTop !== pane.scrollTop) { syncing = true; other.scrollTop = pane.scrollTop; syncing = false; }
      });
    }
    position.textContent = c.position(value.blocks.length ? current + 1 : 0, value.blocks.length);
    previous.disabled = !value.blocks.length || current === 0; next.disabled = !value.blocks.length || current === value.blocks.length - 1;
    previousPage.disabled = history.length === 0; nextPage.disabled = !following;
    element<HTMLOutputElement>(root, '[data-diff-section]').textContent = c.section(cursor.row, cursor.offset);
  };
  const move = (direction: number) => {
    if (!value) return;
    const index = current + direction;
    if (index < 0 || index >= value.blocks.length) return;
    current = index; cursor = { row: Math.max(0, value.blocks[index]!.start - 3), offset: 0 }; inspect = false; history = []; render(value.blocks[index]!.start); documentArea.scrollIntoView({ block: 'nearest' });
  };
  previous.addEventListener('click', () => move(-1), { signal: listeners.signal }); next.addEventListener('click', () => move(1), { signal: listeners.signal });
  nextPage.addEventListener('click', () => { if (!following) return; history.push({ cursor: { ...cursor }, inspect }); cursor = following; render(); documentArea.focus(); }, { signal: listeners.signal });
  previousPage.addEventListener('click', () => { const saved = history.pop(); if (saved) { cursor = saved.cursor; inspect = saved.inspect; render(); documentArea.focus(); } }, { signal: listeners.signal });
  view.addEventListener('change', () => render(), { signal: listeners.signal });
  const reset = () => { value = undefined; current = 0; following = undefined; cursor = { row: 0, offset: 0 }; history = []; inspect = false; area.hidden = true; documentArea.replaceChildren(); element<HTMLElement>(root, '[data-diff-summary]').textContent = ''; position.textContent = ''; previous.disabled = next.disabled = previousPage.disabled = nextPage.disabled = true; };
  reset();
  return {
    reset,
    show(result: DiffValue) {
      reset(); value = result;
      element<HTMLElement>(root, '[data-diff-summary]').textContent = result.identical ? c.identical : c.stats(result.added, result.deleted, result.blocks.length);
      element<HTMLElement>(root, '[data-diff-inline]').hidden = !result.partialInline;
      element<HTMLElement>(root, '[data-diff-newline]').hidden = !result.finalNewlineChanged;
      render(result.blocks[0]?.start);
    },
    dispose() { reset(); listeners.abort(); },
  };
}
