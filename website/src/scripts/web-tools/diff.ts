import { refreshLineNumbers } from './line-numbers';
import { JobRunner } from '../../lib/web-tools/job-runner';
import { diffLimits, type DiffJobInput, type DiffValue } from '../../lib/web-tools/text-diff-types';
import { validateDiffSource } from '../../lib/web-tools/text-diff-input';
import { decodeDiffFile } from '../../lib/web-tools/text-diff-file';
import type { ToolError } from '../../lib/web-tools/contracts';
import { createDiffRenderer } from './diff-render';
import { diffCopy } from './diff-copy';
import { element, type UI } from './ui';
export function initDiff(ui: UI) {
  const { root, locale } = ui, c = diffCopy[locale];
  const renderer = createDiffRenderer(root, c);
  const runner = new JobRunner<DiffJobInput, DiffValue>(() => new Worker(new URL('./diff-worker.ts', import.meta.url), { type: 'module' }));
  const before = element<HTMLTextAreaElement>(root, '[data-diff-source="before"]');
  const after = element<HTMLTextAreaElement>(root, '[data-diff-source="after"]');
  const compare = element<HTMLButtonElement>(root, '[data-diff-compare]');
  const cancel = element<HTMLButtonElement>(root, '[data-diff-cancel]');
  const listeners = new AbortController();
  let generation = 0, disposed = false, running = false;
  let activeRead: { reader: FileReader; timer: ReturnType<typeof setTimeout> } | undefined;
  const error = (value: ToolError) => ui.status(value.code === 'limit' ? c.limit : value.code === 'timeout' ? c.timeout : value.code === 'text-file' ? c.fileError : value.code === 'cancelled' ? c.cancelled : c.worker, true);
  const controls = () => { compare.disabled = !!activeRead || running; cancel.hidden = !activeRead && !running; };
  const stopRead = () => {
    const reading = activeRead; activeRead = undefined;
    if (reading) { clearTimeout(reading.timer); reading.reader.onload = reading.reader.onerror = reading.reader.onabort = null; if (reading.reader.readyState === FileReader.LOADING) reading.reader.abort(); }
  };
  const invalidate = () => { generation++; runner.cancel(); stopRead(); running = false; renderer.reset(); controls(); };
  const updateCursor = (side: 'before' | 'after', source: HTMLTextAreaElement) => {
    refreshLineNumbers(source);
    const prefix = source.value.slice(0, source.selectionStart), parts = prefix.split('\n');
    element<HTMLOutputElement>(root, `[data-diff-cursor="${side}"]`).textContent = c.cursor(parts.length, Array.from(parts.at(-1) ?? '').length + 1);
  };
  for (const side of ['before', 'after'] as const) {
    const source = side === 'before' ? before : after;
    const origin = element<HTMLElement>(root, `[data-diff-origin="${side}"]`);
    const fileInput = element<HTMLInputElement>(root, `[data-diff-file="${side}"]`);
    source.addEventListener('input', () => { invalidate(); origin.textContent = ''; updateCursor(side, source); ui.status(c.stale); }, { signal: listeners.signal });
    for (const event of ['click', 'keyup', 'select']) source.addEventListener(event, () => updateCursor(side, source), { signal: listeners.signal });
    element<HTMLButtonElement>(root, `[data-diff-open="${side}"]`).addEventListener('click', () => { invalidate(); ui.status(c.ready); fileInput.click(); }, { signal: listeners.signal });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0]; fileInput.value = '';
      if (!file) return;
      invalidate();
      if (file.size > diffLimits.bytes) { error({ code: 'limit' }); return; }
      const readGeneration = generation;
      const reader = new FileReader();
      const finish = () => { if (activeRead?.reader === reader) { clearTimeout(activeRead.timer); activeRead = undefined; } reader.onload = reader.onerror = reader.onabort = null; controls(); };
      const timer = setTimeout(() => { if (readGeneration !== generation || disposed) return; invalidate(); error({ code: 'timeout' }); }, 5000);
      activeRead = { reader, timer }; controls(); ui.status(c.reading);
      reader.onload = () => {
        if (readGeneration !== generation || disposed) return;
        const data = reader.result;
        const result = data instanceof ArrayBuffer ? decodeDiffFile(new Uint8Array(data)) : { ok: false as const, error: { code: 'text-file' as const } };
        finish();
        if (!result.ok) { error(result.error); return; }
        source.value = result.value; origin.textContent = file.name.replace(/^.*[\\/]/, ''); updateCursor(side, source); ui.status(c.ready);
      };
      reader.onerror = () => { if (readGeneration !== generation || disposed) return; finish(); error({ code: 'text-file' }); };
      reader.onabort = () => { if (readGeneration !== generation || disposed) return; finish(); ui.status(c.cancelled); };
      try { reader.readAsArrayBuffer(file); } catch { finish(); error({ code: 'text-file' }); }
    }, { signal: listeners.signal });
  }
  compare.addEventListener('click', async () => {
    if (activeRead) return;
    invalidate();
    const original = validateDiffSource(before.value), changed = validateDiffSource(after.value);
    if (!original.ok) { error(original.error); return; }
    if (!changed.ok) { error(changed.error); return; }
    const runGeneration = generation;
    running = true; controls(); ui.status(c.working);
    const result = await runner.run({ operation: 'text-diff', before: before.value, after: after.value });
    if (disposed || runGeneration !== generation) return;
    running = false; controls();
    if (!result.ok) { renderer.reset(); error(result.error); return; }
    renderer.show(result.value); ui.status(result.value.identical ? c.identical : c.stats(result.value.added, result.value.deleted, result.value.blocks.length));
  }, { signal: listeners.signal });
  cancel.addEventListener('click', () => { invalidate(); ui.status(c.cancelled); }, { signal: listeners.signal });
  element(root, '[data-diff-clear]').addEventListener('click', () => { invalidate(); before.value = after.value = ''; root.querySelectorAll<HTMLElement>('[data-diff-origin]').forEach(origin => { origin.textContent = ''; }); updateCursor('before', before); updateCursor('after', after); ui.status(c.ready); before.focus(); }, { signal: listeners.signal });
  element(root, '[data-diff-swap]').addEventListener('click', () => {
    invalidate(); [before.value, after.value] = [after.value, before.value];
    const original = element<HTMLElement>(root, '[data-diff-origin="before"]'), changed = element<HTMLElement>(root, '[data-diff-origin="after"]');
    [original.textContent, changed.textContent] = [changed.textContent, original.textContent]; updateCursor('before', before); updateCursor('after', after); ui.status(c.stale);
  }, { signal: listeners.signal });
  element(root, '[data-diff-example]').addEventListener('click', () => {
    invalidate(); before.value = 'hello world\nZero tools\n<script>alert(1)</script>\n'; after.value = 'hello Zero\nZero tools\n<script>alert(1)</script>';
    root.querySelectorAll<HTMLElement>('[data-diff-origin]').forEach(origin => { origin.textContent = ''; }); updateCursor('before', before); updateCursor('after', after); ui.status(c.ready);
  }, { signal: listeners.signal });
  const dispose = () => { disposed = true; invalidate(); renderer.dispose(); listeners.abort(); before.value = after.value = ''; root.querySelectorAll<HTMLElement>('[data-diff-origin]').forEach(origin => { origin.textContent = ''; }); ui.status(''); };
  window.addEventListener('pagehide', dispose, { once: true });
  ui.status(c.ready); controls();
}
