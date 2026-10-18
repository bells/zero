import type { ImageCodecProbe, ProbeMessage, ProbeRequest, ProbeResult } from './contracts.ts';
function element<T extends HTMLElement>(id: string): T { return document.getElementById(id) as T; }
const output = element<HTMLPreElement>('result');
const stop = element<HTMLButtonElement>('stop');
const source = element<HTMLInputElement>('local');
const encode = element<HTMLInputElement>('encode');
let terminate: (() => void) | undefined;
let urls: string[] = [];
let localFile: File | undefined;
let localIsHeic = false;
function busy(value: boolean) {
  document.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('[data-run], #local, #encode, #large, #rotation').forEach((control) => { control.disabled = value; });
  stop.disabled = !value;
  if (!value) element<HTMLButtonElement>('heic48').disabled = !element<HTMLInputElement>('large').checked;
}
function show(result: unknown) {
  output.textContent = JSON.stringify(result, (_key, value: unknown) => value instanceof Blob ? { bytes: value.size, type: value.type } : value, 2);
}
function clearExports() {
  for (const url of urls) URL.revokeObjectURL(url);
  urls = [];
  for (const id of ['download-jpeg', 'download-zip', 'preview']) {
    const control = element<HTMLButtonElement>(id);
    control.disabled = true;
    control.onclick = null;
  }
  const image = element<HTMLImageElement>('image');
  image.removeAttribute('src');
  image.hidden = true;
  element('retained').textContent = '未保留结果。';
}
function retain(result: ProbeResult) {
  if (result.kind !== 'heic' || !result.jpeg || !result.zip) return;
  for (const [blob, id, name] of [[result.jpeg, 'download-jpeg', 'image-lab-result.jpg'], [result.zip, 'download-zip', 'image-lab-result.zip']] as const) {
    const url = URL.createObjectURL(blob);
    urls.push(url);
    const control = element<HTMLButtonElement>(id);
    control.disabled = false;
    control.onclick = () => {
      const link = document.createElement('a');
      link.href = url; link.download = name; link.click();
    };
  }
  const preview = element<HTMLButtonElement>('preview');
  preview.disabled = false;
  preview.onclick = () => {
    const image = element<HTMLImageElement>('image');
    image.src = urls[0]!; image.hidden = false;
    element('retained').textContent += ' 已显式打开全尺寸 JPEG 的浏览器预览，可能增加解码内存。';
    preview.disabled = true;
  };
  element('retained').textContent = `保留一张 JPEG ${result.jpeg.size} 字节、一个 ZIP ${result.zip.size} 字节；下次处理或清空时释放引用。Blob 大小不等于内存占用。`;
}
function worker() { return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }); }
const probe: ImageCodecProbe = {
  cancel() { terminate?.(); },
  run(request, timeoutMs = 60_000) {
    probe.cancel();
    clearExports();
    busy(true);
    show({ status: 'running', timeoutMs });
    return new Promise<ProbeResult>((resolve) => {
      let port: Worker;
      try { port = worker(); } catch { busy(false); resolve({ kind: 'error', code: 'worker-load' }); return; }
      let finished = false;
      const finish = (result: ProbeResult) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer); port.terminate(); terminate = undefined; busy(false); resolve(result);
      };
      const timer = setTimeout(() => finish({ kind: 'error', code: 'timeout' }), timeoutMs);
      terminate = () => finish({ kind: 'error', code: 'cancelled' });
      port.onmessage = ({ data }: MessageEvent<ProbeMessage>) => {
        if (data.kind === 'result') finish(data.result);
        else if (!finished) show({ status: data.phase, note: '主图尺寸已检查，正在解码。' });
      };
      port.onerror = (event) => { event.preventDefault(); finish({ kind: 'error', code: 'worker' }); };
      if (request.operation === 'heic' && request.bytes) port.postMessage(request, [request.bytes]);
      else port.postMessage(request);
    });
  },
  cancelDecode(fixture) {
    probe.cancel(); clearExports(); busy(true);
    return new Promise((resolve, reject) => {
      const start = performance.now();
      let port: Worker;
      try { port = worker(); } catch { busy(false); reject(new Error('Worker load failed')); return; }
      let cancelled = false, lateResults = 0;
      const fail = () => { clearTimeout(deadline); port.terminate(); terminate = undefined; busy(false); reject(new Error('Cancellation probe failed')); };
      const deadline = setTimeout(fail, 60_000);
      terminate = fail;
      port.onmessage = ({ data }: MessageEvent<ProbeMessage>) => {
        if (cancelled) { lateResults++; return; }
        if (data.kind === 'progress') {
          cancelled = true; port.terminate(); clearTimeout(deadline);
          // Keep this probe active through the late-response observation period.
          const observation = setTimeout(() => { terminate = undefined; busy(false); resolve({ terminated: true, lateResults, elapsedMs: performance.now() - start }); }, 200);
          terminate = () => { clearTimeout(observation); fail(); };
        } else fail();
      };
      port.onerror = (event) => { event.preventDefault(); fail(); };
      port.postMessage({ operation: 'heic', fixture, pixelLimit: 50_000_000 } satisfies ProbeRequest);
    });
  },
};
window.imageCodecProbe = probe;
let revision = 0;
async function run(request: ProbeRequest) {
  const current = ++revision;
  const result = await probe.run(request);
  if (current !== revision) return;
  show(result); retain(result);
}
function heic(fixture: string) { void run({ operation: 'heic', fixture, pixelLimit: 50_000_000, exportJpeg: encode.checked }); }
element('codecs').onclick = () => void run({ operation: 'codecs', fixture: 'alpha.png' });
element('heic').onclick = () => heic('synthetic-12mp.heic');
element('heic48').onclick = () => heic('synthetic-48mp.heic');
element('rotate').onclick = () => heic(`heic-rotate-${element<HTMLSelectElement>('rotation').value}.heic`);
element('cancel').onclick = () => {
  const current = ++revision;
  show({ status: 'cancellation-probe' });
  void probe.cancelDecode('synthetic-48mp.heic').then((result) => { if (current === revision) show(result); }).catch(() => { if (current === revision) show({ kind: 'error', code: 'cancel-probe' }); });
};
stop.onclick = () => { ++revision; probe.cancel(); busy(false); show({ kind: 'error', code: 'cancelled' }); };
element('timeout').onclick = () => void run({ operation: 'spin', fixture: '' });
element<HTMLInputElement>('large').onchange = () => { element<HTMLButtonElement>('heic48').disabled = !element<HTMLInputElement>('large').checked; };
source.onchange = async () => {
  const current = ++revision;
  localFile = source.files?.[0]; localIsHeic = false;
  clearExports();
  if (!localFile) return;
  if (localFile.size > 32 * 1024 * 1024) { show({ kind: 'error', code: 'experimental-source-limit' }); localFile = undefined; return; }
  const header = new Uint8Array(await localFile.slice(0, 64).arrayBuffer());
  if (current !== revision) return;
  const text = new TextDecoder().decode(header);
  localIsHeic = text.slice(4, 8) === 'ftyp' && /heic|heix|hevc|hevx|mif1/.test(text.slice(8));
  const suppliedFormat = localIsHeic ? 'HEIF candidate; decoder must verify' : header[0] === 255 && header[1] === 216 ? 'JPEG bytes (not original HEIC evidence)' : header[0] === 137 && text.slice(1, 4) === 'PNG' ? 'PNG bytes' : text.slice(0, 4) === 'RIFF' && text.slice(8, 12) === 'WEBP' ? 'WebP bytes' : 'unsupported bytes';
  show({ suppliedFormat, bytes: localFile.size, note: '未解码、未上传；不记录文件名。原始 HEIC 请从“文件”选择，照片选择器可能转码。' });
};
element('decode-local').onclick = async () => {
  if (!localFile || !localIsHeic) { show({ kind: 'error', code: 'choose-raw-heic' }); return; }
  const current = ++revision;
  busy(true);
  try {
    const bytes = await localFile.arrayBuffer();
    if (current !== revision) return;
    const result = await probe.run({ operation: 'heic', bytes, pixelLimit: 50_000_000, exportJpeg: encode.checked });
    if (current === revision) { show(result); retain(result); }
  } catch { if (current === revision) show({ kind: 'error', code: 'file-read' }); }
  finally { if (current === revision) busy(false); }
};
function clear() {
  ++revision; probe.cancel(); clearExports(); localFile = undefined; localIsHeic = false; source.value = ''; busy(false); show({ status: 'ready' });
}
element('clear').onclick = clear;
window.addEventListener('pagehide', clear);
window.addEventListener('pageshow', (event) => { if (event.persisted) clear(); });
