import { unicodeCopy } from '../../content/unicode-copy';
import { JobRunner } from '../../lib/web-tools/job-runner';
import { textFits, type UnicodeOperation } from '../../lib/web-tools/contracts';
import { refreshLineNumbers } from './line-numbers';
import { element, type UI } from './ui';

export function initUnicode(ui: UI): void {
  const { root, locale, c } = ui;
  const u = unicodeCopy[locale];
  const source = element<HTMLTextAreaElement>(root, '[data-source]');
  const output = element<HTMLTextAreaElement>(root, '[data-output]');
  const ascii = element<HTMLInputElement>(root, '[data-unicode-ascii]');
  const copy = element<HTMLButtonElement>(root, '[data-copy-output]');
  const download = element<HTMLButtonElement>(root, '[data-unicode-download]');
  const cancel = element<HTMLButtonElement>(root, '[data-cancel]');
  const actions = [...root.querySelectorAll<HTMLButtonElement>('[data-unicode-action]')];
  const runner = new JobRunner(() => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }));
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  let revision = 0, alive = true, resultText: string | undefined, objectUrl: string | undefined;
  const busy = (value: boolean) => {
    root.setAttribute('aria-busy', String(value));
    cancel.hidden = !value;
    actions.forEach(button => { button.disabled = value; });
  };
  const invalidate = () => {
    revision++; runner.cancel(); busy(false);
    resultText = undefined; output.value = '';
    copy.disabled = true; download.disabled = true;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = undefined;
    element<HTMLElement>(root, '[data-manual-copy]').hidden = true;
    element<HTMLTextAreaElement>(root, '[data-manual-value]').value = '';
    refreshLineNumbers(source); refreshLineNumbers(output);
  };
  const changed = () => { invalidate(); ui.status(c.ready); };
  const perform = async (operation: UnicodeOperation) => {
    invalidate();
    const current = revision;
    if (!source.value.length) { ui.status(u.empty, true); return; }
    if (!textFits(source.value)) { ui.error({ code: 'limit' }); return; }
    busy(true); ui.status(c.working);
    const result = await runner.run({ operation, input: source.value, escapeAscii: ascii.checked });
    if (!alive || revision !== current) return;
    busy(false);
    if (!result.ok) { ui.error(result.error); return; }
    // Textareas normalize CR/CRLF; retain the exact result separately for exports.
    resultText = result.value.text;
    output.value = resultText; refreshLineNumbers(output);
    copy.disabled = false; download.disabled = false;
    ui.status(u.success);
  };
  source.addEventListener('input', changed, options);
  ascii.addEventListener('change', changed, options);
  actions.forEach(button => button.addEventListener('click', () => {
    const operation = button.dataset.unicodeAction;
    if (operation === 'unicode-encode' || operation === 'unicode-decode') void perform(operation);
  }, options));
  root.querySelectorAll<HTMLButtonElement>('[data-unicode-example]').forEach(button => button.addEventListener('click', () => {
    source.value = button.dataset.unicodeExample === 'encode' ? '你好，Zero 😀\n' : '\\u4F60\\u597D，Zero \\u{1F600}';
    changed(); source.focus();
  }, options));
  copy.addEventListener('click', () => {
    const current = revision;
    if (resultText !== undefined) void ui.copy(resultText, () => alive && revision === current);
  }, options);
  download.addEventListener('click', () => {
    if (resultText === undefined) return;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(new Blob([resultText], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = objectUrl; anchor.download = 'zero-unicode.txt';
    document.body.append(anchor); anchor.click(); anchor.remove();
  }, options);
  cancel.addEventListener('click', () => { invalidate(); ui.error({ code: 'cancelled' }); }, options);
  element(root, '[data-clear]').addEventListener('click', () => { source.value = ''; changed(); source.focus(); }, options);
  window.addEventListener('pagehide', () => {
    alive = false; source.value = ''; invalidate(); listeners.abort();
  }, { once: true });
}
