import { JobRunner } from '../../lib/web-tools/job-runner';
import { limits, textFits, type Job, type JobValue, type Operation } from '../../lib/web-tools/contracts';
import type { EditorHandle } from './editor';
import { element, type UI } from './ui';
export function initProcessor(ui: UI, tool: 'json' | 'base64') {
  const { root, c } = ui;
  const source = element<HTMLTextAreaElement>(root, '[data-source]');
  const output = element<HTMLTextAreaElement>(root, '[data-output]');
  const copy = element<HTMLButtonElement>(root, '[data-copy-output]');
  const cancel = element<HTMLButtonElement>(root, '[data-cancel]');
  const file = root.querySelector<HTMLInputElement>('[data-file]');
  const mode = root.querySelector<HTMLSelectElement>('[data-mode]');
  const operations = [...root.querySelectorAll<HTMLButtonElement>('[data-operation], [data-codec-action]')];
  const runner = new JobRunner(() => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }));
  let revision = 0, editor: EditorHandle | undefined, objectUrl: string | undefined, imageText: string | undefined;
  let isAlive = true;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const revoke = () => { if (objectUrl) URL.revokeObjectURL(objectUrl); objectUrl = undefined; imageText = undefined; const area = root.querySelector<HTMLElement>('[data-image-area]'); if (area) { area.hidden = true; element<HTMLImageElement>(area, 'img').removeAttribute('src'); element<HTMLAnchorElement>(area, 'a').removeAttribute('href'); } };
  const busy = (value: boolean) => { if (!value && deadline) { clearTimeout(deadline); deadline = undefined; } cancel.hidden = !value; operations.forEach((button) => { button.disabled = value; }); root.setAttribute('aria-busy', String(value)); };
  const invalidate = () => { revision++; runner.cancel(); output.value = ''; copy.disabled = true; busy(false); revoke(); editor?.error(); element<HTMLElement>(root, '[data-manual-copy]').hidden = true; element<HTMLTextAreaElement>(root, '[data-manual-value]').value = ''; };
  const changed = () => { invalidate(); ui.status(c.ready); };
  source.addEventListener('input', () => { if (file) file.value = ''; changed(); });
  file?.addEventListener('change', () => { source.value = ''; changed(); });
  mode?.addEventListener('change', () => { source.value = ''; if (file) file.value = ''; changed(); element<HTMLElement>(root, '[data-file-label]').hidden = mode.value !== 'image'; });
  const showImage = async (value: JobValue, current: number) => {
    if (!value.bytes || !value.mime) return;
    const blob = new Blob([new Uint8Array(value.bytes)], { type: value.mime });
    const url = URL.createObjectURL(blob); objectUrl = url;
    const image = element<HTMLImageElement>(root, '[data-image-preview]');
    image.src = url;
    try { await image.decode(); } catch { if (current === revision) { revoke(); ui.error({ code: 'image' }); } return false; }
    if (current !== revision || !isAlive) { URL.revokeObjectURL(url); return false; }
    const download = element<HTMLAnchorElement>(root, '[data-image-download]');
    download.href = url; download.download = `zero-image.${value.mime === 'image/jpeg' ? 'jpg' : value.mime.split('/')[1]}`;
    element<HTMLElement>(root, '[data-image-info]').textContent = `${value.width} × ${value.height} · ${(value.bytes.length / 1024).toFixed(1)} KiB · ${value.mime}`;
    element<HTMLElement>(root, '[data-image-area]').hidden = false;
    imageText = value.text;
    return true;
  };
  const perform = async (operation: Operation) => {
    invalidate(); const current = revision;
    deadline = setTimeout(() => { invalidate(); ui.error({ code: 'timeout' }); }, 5000);
    let input: Job['input'] = source.value; let mime: string | undefined;
    const selected = file?.files?.[0];
    if (mode?.value === 'image' && operation === 'image-encode' && selected) {
      if (selected.size > limits.image) { busy(false); ui.error({ code: 'limit' }); return; }
      busy(true); ui.status(c.working);
      try { input = new Uint8Array(await selected.arrayBuffer()); mime = selected.type || undefined; } catch { if (current === revision) { busy(false); ui.error({ code: 'image' }); } return; }
      if (current !== revision) return;
    }
    if (typeof input === 'string' && !textFits(input, mode?.value === 'image' ? limits.encodedImage : limits.text)) { ui.error({ code: 'limit' }); busy(false); return; }
    busy(true); ui.status(c.working);
    const result = await runner.run({ operation, input, mime });
    if (current !== revision || !isAlive) return;
    if (!result.ok) { busy(false); editor?.error(result.error); ui.error(result.error); return; }
    if (mode?.value === 'image') {
      const decoded = await showImage(result.value, current);
      if (current !== revision) return;
      if (!decoded) { invalidate(); ui.error({ code: 'image' }); return; }
    }
    if (operation === 'unwrap') { source.value = result.value.text; editor?.set(source.value); }
    output.value = result.value.text; copy.disabled = false; busy(false); ui.status(c.success);
  };
  operations.forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.operation) void perform(button.dataset.operation as Operation);
    else {
      const action = button.dataset.codecAction === 'decode' ? 'decode' : 'encode';
      const prefix = mode?.value === 'url' ? 'url' : mode?.value === 'image' ? 'image' : 'base64';
      void perform(`${prefix}-${action}` as Operation);
    }
  }));
  copy.addEventListener('click', () => { if (!copy.disabled) void ui.copy(output.value); });
  cancel.addEventListener('click', () => { invalidate(); ui.error({ code: 'cancelled' }); });
  element(root, '[data-clear]').addEventListener('click', () => { source.value = ''; if (file) file.value = ''; editor?.set(''); changed(); if (editor) editor.focus(); else source.focus(); });
  const enhance = root.querySelector<HTMLButtonElement>('[data-editor-enable]');
  enhance?.addEventListener('click', async () => {
    if (editor) return;
    if (!textFits(source.value)) { ui.error({ code: 'limit' }); return; }
    enhance.disabled = true;
    try { const module = await import('./editor'); if (!isAlive) return; editor = module.createEditor(source, element(root, '[data-editor-host]'), changed); enhance.hidden = true; }
    catch { ui.status(c.enhanceFailed, true); enhance.disabled = false; }
  });
  if (tool === 'base64') {
    // Explicitly choose whether to copy the full Data URL or only its Base64 payload.
    const button = document.createElement('button'); button.type = 'button'; button.textContent = ui.locale === 'zh' ? '复制纯 Base64' : 'Copy raw Base64'; button.hidden = true;
    element(root, '.wt-actions').append(button);
    button.addEventListener('click', () => { if (imageText) void ui.copy(imageText.slice(imageText.indexOf(',') + 1)); });
    const observer = new MutationObserver(() => { button.hidden = !imageText || copy.disabled; }); observer.observe(copy, { attributes: true, attributeFilter: ['disabled'] });
    window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
  }
  window.addEventListener('pagehide', () => { isAlive = false; invalidate(); editor?.destroy(); source.value = ''; if (file) file.value = ''; }, { once: true });
}
