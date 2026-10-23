import { webCopy } from '../../content/web-copy';
import type { Locale } from '../../content/site';
import type { ToolError } from '../../lib/web-tools/contracts';
import { errorMessage } from './messages';
export function element<T extends Element>(root: ParentNode, selector: string): T {
  const result = root.querySelector<T>(selector);
  if (!result) throw new Error(`Missing tool control: ${selector}`);
  return result;
}
export function createUI(root: HTMLElement, locale: Locale) {
  const c = webCopy[locale];
  const statusElement = root.querySelector<HTMLElement>('[data-status]');
  const status = (message: string, error = false) => { if (statusElement) { statusElement.textContent = message; statusElement.dataset.error = String(error); } };
  const error = (value: ToolError) => status(errorMessage(value, locale), true);
  const copy = async (text: string, current: () => boolean = () => true) => {
    const fallback = root.querySelector<HTMLElement>('[data-manual-copy]');
    if (fallback) fallback.hidden = true;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('unavailable');
      await navigator.clipboard.writeText(text); if (current()) status(c.copied);
    } catch {
      if (!current()) return;
      status(c.copyFailed, true);
      if (fallback) { fallback.hidden = false; const field = element<HTMLTextAreaElement>(fallback, 'textarea'); field.value = text; field.focus(); field.select(); }
    }
  };
  return { c, locale, root, status, error, copy };
}
export type UI = ReturnType<typeof createUI>;
