import { JobRunner } from '../../lib/web-tools/job-runner';
import { serializeTimestampBatch, type BatchJobInput, type BatchValue } from '../../lib/web-tools/timestamp-batch';
import type { Unit } from '../../lib/web-tools/timestamp';
import { batchCopy } from '../../content/timestamp-batch-copy';
import { element, type UI } from './ui';

export function initTimestampBatch(ui: UI) {
  const { root, locale, c } = ui;
  const b = batchCopy[locale];
  const source = element<HTMLTextAreaElement>(root, '[data-batch-source]');
  const unit = element<HTMLSelectElement>(root, '[data-batch-unit]');
  const zone = element<HTMLSelectElement>(root, '[data-batch-zone]');
  const run = element<HTMLButtonElement>(root, '[data-batch-run]');
  const cancel = element<HTMLButtonElement>(root, '[data-batch-cancel]');
  const copy = element<HTMLButtonElement>(root, '[data-batch-copy]');
  const download = element<HTMLButtonElement>(root, '[data-batch-download]');
  const resultArea = element<HTMLElement>(root, '[data-batch-result]');
  const rows = element<HTMLTableSectionElement>(root, '[data-batch-rows]');
  const previous = element<HTMLButtonElement>(root, '[data-batch-previous]');
  const next = element<HTMLButtonElement>(root, '[data-batch-next]');
  const runner = new JobRunner<BatchJobInput, BatchValue>(() => new Worker(new URL('./batch-worker.ts', import.meta.url), { type: 'module' }));
  let revision = 0, alive = true, page = 0, batch: BatchValue | undefined, json: string | undefined, exportUrl: string | undefined;
  const manual = () => { element<HTMLElement>(root, '[data-manual-copy]').hidden = true; element<HTMLTextAreaElement>(root, '[data-manual-value]').value = ''; };
  const busy = (active: boolean) => { run.disabled = active; cancel.hidden = !active; root.setAttribute('aria-busy', String(active)); };
  const invalidate = () => {
    revision++; runner.cancel(); batch = undefined; json = undefined; page = 0;
    if (exportUrl) URL.revokeObjectURL(exportUrl); exportUrl = undefined;
    rows.replaceChildren(); resultArea.hidden = true; copy.disabled = download.disabled = true; manual(); busy(false);
  };
  const interpretation = (value: string) => value === 'seconds' ? c.seconds : value === 'milliseconds' ? c.milliseconds : value === 'offset' ? locale === 'zh' ? '输入时区偏移' : 'Input offset' : value;
  const draw = () => {
    if (!batch) return;
    const fragment = document.createDocumentFragment();
    for (const row of batch.rows.slice(page * 100, (page + 1) * 100)) {
      const tr = document.createElement('tr');
      for (const text of [String(row.line), row.source]) { const td = document.createElement('td'); td.textContent = text; tr.append(td); }
      const cell = document.createElement('td');
      if (!row.ok) { cell.textContent = row.error.message; cell.className = 'wt-batch-error'; }
      else {
        const list = document.createElement('dl');
        const entries: [string, string][] = [[b.interpretation, interpretation(row.interpretation)], [c.seconds, row.value.seconds], [c.milliseconds, row.value.milliseconds], [c.beijing, row.value.beijing], ['UTC', row.value.utc], ['ISO 8601', row.value.iso]];
        for (const [label, value] of entries) {
          const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = value; list.append(dt, dd);
        }
        cell.append(list);
      }
      tr.append(cell); fragment.append(tr);
    }
    rows.replaceChildren(fragment);
    const total = Math.ceil(batch.rows.length / 100);
    element<HTMLOutputElement>(root, '[data-batch-page]').textContent = `${b.page} ${page + 1} / ${total}`;
    previous.disabled = page === 0; next.disabled = page + 1 >= total;
    element<HTMLElement>(root, '[data-batch-summary]').textContent = `${batch.counts.success} ${b.success} · ${batch.counts.failed} ${b.failure} · ${batch.counts.skipped} ${b.skipped}`;
  };
  const changed = () => { invalidate(); ui.status(b.ready); };
  source.addEventListener('input', changed); unit.addEventListener('change', changed); zone.addEventListener('change', changed);
  root.querySelectorAll<HTMLButtonElement>('[data-time-mode]').forEach((button) => button.addEventListener('click', () => {
    const isBatch = button.dataset.timeMode === 'batch'; invalidate();
    root.querySelectorAll<HTMLButtonElement>('[data-time-mode]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    element<HTMLElement>(root, '[data-single-panel]').hidden = isBatch;
    element<HTMLElement>(root, '[data-batch-panel]').hidden = !isBatch;
    ui.status(isBatch ? b.ready : c.ready);
  }));
  run.addEventListener('click', () => { void (async () => {
    invalidate(); const current = revision; busy(true); ui.status(c.working);
    const result = await runner.run({ operation: 'timestamp-batch', source: source.value, unit: unit.value as Unit, timezone: zone.value === 'UTC' ? 'UTC' : 'UTC+08:00', referenceNow: Date.now(), locale });
    if (!alive || current !== revision) return;
    busy(false);
    if (!result.ok) { ui.error(result.error); return; }
    const encoded = serializeTimestampBatch(result.value);
    if (!encoded.ok) { ui.error(encoded.error); return; }
    batch = result.value; json = encoded.value; resultArea.hidden = false; copy.disabled = download.disabled = false; draw(); ui.status(c.success);
  })(); });
  previous.addEventListener('click', () => { if (batch && page > 0) { page--; draw(); } });
  next.addEventListener('click', () => { if (batch && (page + 1) * 100 < batch.rows.length) { page++; draw(); } });
  copy.addEventListener('click', () => { if (json) { const current = revision; void ui.copy(json, () => alive && current === revision); } });
  download.addEventListener('click', () => {
    if (!json) return;
    if (exportUrl) URL.revokeObjectURL(exportUrl);
    exportUrl = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a'); link.href = exportUrl; link.download = 'zero-timestamp-batch.json'; link.click();
  });
  cancel.addEventListener('click', () => { invalidate(); ui.error({ code: 'cancelled' }); });
  element(root, '[data-batch-clear]').addEventListener('click', () => { source.value = ''; changed(); source.focus(); });
  element(root, '[data-batch-example]').addEventListener('click', () => { source.value = '1700000000\n1700000000000\n2026-10-15 08:00:00\nnot-a-date'; changed(); source.focus(); });
  window.addEventListener('pagehide', () => { alive = false; source.value = ''; invalidate(); }, { once: true });
}
