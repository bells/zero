import { parseTimestamp, timestampRows, type Unit } from '../../lib/web-tools/timestamp';
import { element, type UI } from './ui';
export function initTimestamp(ui: UI) {
  const { root, c } = ui;
  const input = element<HTMLInputElement>(root, '[data-source]');
  const unit = element<HTMLSelectElement>(root, '[data-unit]');
  const zone = element<HTMLSelectElement>(root, '[data-zone]');
  const results = element<HTMLElement>(root, '[data-time-results]');
  const adopted = element<HTMLElement>(root, '[data-interpretation]');
  const pause = element<HTMLButtonElement>(root, '[data-pause]');
  let running = true, now = Date.now();
  const values = { seconds: element<HTMLOutputElement>(root, '[data-clock="seconds"]'), milliseconds: element<HTMLOutputElement>(root, '[data-clock="milliseconds"]') };
  const convert = (announce = true) => {
    if (!input.value.trim()) { results.hidden = true; adopted.textContent = ''; if (announce) ui.status(c.ready); return; }
    const result = parseTimestamp(input.value, unit.value as Unit, zone.value === 'UTC' ? 'UTC' : 'UTC+08:00');
    if (!result.ok) { results.hidden = true; adopted.textContent = ''; if (announce) ui.error(result.error); return; }
    results.hidden = false;
    const label = result.value.interpretation === 'seconds' ? c.seconds : result.value.interpretation === 'milliseconds' ? c.milliseconds : result.value.interpretation === 'offset' ? ui.locale === 'zh' ? '输入中的时区偏移' : 'Input timezone offset' : result.value.interpretation;
    adopted.textContent = `${c.adopted}: ${label}`;
    timestampRows(result.value.milliseconds, now, ui.locale).forEach((value, index) => { element<HTMLOutputElement>(root, `[data-row="${index}"]`).textContent = value; });
    if (announce) ui.status(c.success);
  };
  const draw = () => { values.seconds.textContent = String(Math.floor(now / 1000)); values.milliseconds.textContent = String(now); convert(false); };
  const tick = () => { if (running && !document.hidden) { now = Date.now(); draw(); } };
  const timer = window.setInterval(tick, 1000); draw();
  pause.addEventListener('click', () => { running = !running; pause.textContent = running ? c.pause : c.resume; pause.setAttribute('aria-pressed', String(!running)); if (running) tick(); });
  const visible = () => { if (!document.hidden) tick(); }; document.addEventListener('visibilitychange', visible);
  [input, unit, zone].forEach((control) => control.addEventListener(control === input ? 'input' : 'change', () => { element<HTMLElement>(root, '[data-manual-copy]').hidden = true; convert(); }));
  root.querySelectorAll<HTMLButtonElement>('[data-copy-clock]').forEach((button) => button.addEventListener('click', () => { const value = button.dataset.copyClock === 'seconds' ? values.seconds : values.milliseconds; void ui.copy(value.textContent ?? ''); }));
  root.querySelectorAll<HTMLButtonElement>('[data-copy-row]').forEach((button) => button.addEventListener('click', () => { if (!results.hidden) void ui.copy(element<HTMLOutputElement>(root, `[data-row="${button.dataset.copyRow}"]`).textContent ?? ''); }));
  element(root, '[data-clear]').addEventListener('click', () => { input.value = ''; element<HTMLElement>(root, '[data-manual-copy]').hidden = true; element<HTMLTextAreaElement>(root, '[data-manual-value]').value = ''; convert(); input.focus(); });
  window.addEventListener('pagehide', () => { clearInterval(timer); document.removeEventListener('visibilitychange', visible); input.value = ''; results.querySelectorAll('output').forEach((value) => { value.textContent = ''; }); }, { once: true });
}
