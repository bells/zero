const updates = new WeakMap<HTMLTextAreaElement, () => void>();

export function refreshLineNumbers(source: HTMLTextAreaElement): void {
  updates.get(source)?.();
}

export function initLineNumbers(root: HTMLElement): void {
  const listeners = new AbortController();
  const disposers: (() => void)[] = [];
  for (const source of root.querySelectorAll<HTMLTextAreaElement>('textarea[data-numbered]')) {
    const wrapper = document.createElement('div');
    wrapper.className = 'wt-numbered-input';
    const gutter = document.createElement('div');
    gutter.className = 'wt-input-gutter';
    gutter.setAttribute('aria-hidden', 'true');
    const numbers = document.createElement('div');
    gutter.append(numbers);
    source.before(wrapper);
    wrapper.append(gutter, source);
    source.wrap = 'off';

    let count = 1;
    let lineHeight = 24;
    let paddingTop = 16;
    let frame = 0;
    const render = () => {
      frame = 0;
      if (!source.clientHeight || source.hidden) return;
      const first = Math.min(count - 1, Math.max(0, Math.floor((source.scrollTop - paddingTop) / lineHeight)));
      const end = Math.min(count, first + Math.ceil(source.clientHeight / lineHeight) + 2);
      const visible: string[] = [];
      for (let index = first; index < end; index++) visible.push(String(index + 1));
      numbers.textContent = visible.join('\n');
      numbers.style.transform = `translateY(${paddingTop + first * lineHeight - source.scrollTop}px)`;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(render); };
    const refresh = () => {
      count = 1;
      const text = source.value;
      for (let index = 0; index < text.length; index++) if (text.charCodeAt(index) === 10) count++;
      wrapper.style.setProperty('--wt-gutter-digits', String(Math.max(2, String(count).length)));
      schedule();
    };
    const measure = () => {
      const style = getComputedStyle(source);
      lineHeight = Number.parseFloat(style.lineHeight);
      paddingTop = Number.parseFloat(style.paddingTop);
      gutter.style.font = style.font;
      schedule();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(source);
    source.addEventListener('input', refresh, { signal: listeners.signal });
    source.addEventListener('scroll', schedule, { signal: listeners.signal, passive: true });
    updates.set(source, refresh);
    refresh();
    disposers.push(() => { observer.disconnect(); cancelAnimationFrame(frame); numbers.textContent = ''; updates.delete(source); });
  }
  window.addEventListener('pagehide', () => { listeners.abort(); disposers.forEach(dispose => dispose()); }, { once: true });
}
