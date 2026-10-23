import type { MarkdownDocument } from '../../lib/web-tools/markdown-contracts';
import { assertMarkdownSource, assertMarkdownOutput, importMarkdownFile, markdownPolicy, safeName } from '../../lib/web-tools/markdown-policy';
import { MarkdownDraftStore, markdownDraftKey } from './markdown-draft';
import { MarkdownSession } from './markdown-session';
import type { MarkdownEditor } from './markdown-editor';
import type { MarkdownImageAsset } from './markdown-assets';
import { createUI, element } from './ui';

export function initMarkdownWorkspace(root: HTMLElement, locale: 'zh' | 'en'): void {
  const zh = locale === 'zh'; const ui = createUI(root, locale);
  const workspace = element<HTMLElement>(root, '[data-markdown]');
  const source = element<HTMLTextAreaElement>(workspace, '[data-md-source]');
  const preview = element<HTMLElement>(workspace, '[data-md-preview]');
  const draftCheckbox = element<HTMLInputElement>(workspace, '[data-md-draft]');
  const draftStatus = element<HTMLElement>(workspace, '[data-md-draft-status]');
  const cancelButton = element<HTMLButtonElement>(workspace, '[data-md-cancel]');
  const imagePanel = element<HTMLDetailsElement>(workspace, '[data-md-images]');
  const imageList = element<HTMLUListElement>(workspace, '[data-md-image-list]');
  const outline = element<HTMLElement>(workspace, '[data-md-outline] nav');
  const parseSession = new MarkdownSession(); const exportSession = new MarkdownSession();
  const assetsByUrl = new Map<string, MarkdownImageAsset>();
  const imageFailures = new Map<string, string>();
  let editor: MarkdownEditor | undefined; let enhancing: Promise<void> | undefined;
  let doc: MarkdownDocument | undefined; let revision = 0; let parsedRevision = -1; let lastSource = '';
  let parseTimer: ReturnType<typeof setTimeout>; let draftTimer: ReturnType<typeof setTimeout>;
  let assetsAbort = new AbortController(); let filename = ''; let exportBusy = false; let imageBusy = false; let exportSequence = 0; let imageSequence = 0;
  let disposed = false; let syncing = false; let releaseSync: ReturnType<typeof setTimeout>;
  let draft: MarkdownDraftStore | undefined;
  let printCleanup: (() => void) | undefined;
  let expanded = false; let expandedFocus: HTMLElement | null = null;
  const urlTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const errors: Record<string, [string, string]> = {
    'source-limit': ['文档超过 1 MiB 或 20,000 行限制。源码仍可下载。', 'Document exceeds 1 MiB or 20,000 lines. Source download remains available.'],
    'unsupported-file': ['仅支持 UTF-8 的 .md、.markdown 和 .txt。', 'Only UTF-8 .md, .markdown and .txt files are supported.'],
    'invalid-utf8': ['文件不是有效 UTF-8，当前文档已保留。', 'Invalid UTF-8. Your current document is preserved.'],
    'invalid-source': ['文档含不支持的控制字符。', 'Document contains unsupported control characters.'],
    'parse-timeout': ['预览处理超时，请缩短文档后重试。', 'Preview timed out. Shorten the document and retry.'],
    'pdf-timeout': ['PDF 生成超时，请缩短文档后重试。', 'PDF generation timed out. Shorten the document and retry.'],
    'font-fetch': ['中文字体加载失败，请重试 PDF 下载。', 'Could not load the Chinese font. Retry PDF download.'],
    'font-glyph': ['PDF 字体不支持文档中的部分字符，请移除后重试，或下载 HTML。', 'The PDF font does not cover some characters. Remove them and retry, or download HTML.'],
    'font-limit': ['PDF 字体超过资源限制。', 'PDF font exceeds the resource limit.'],
    'pdf-pages': ['PDF 超过 500 页限制，请缩短文档。', 'PDF exceeds 500 pages. Shorten the document.'],
    'output-limit': ['导出超过 32 MiB 限制，请减少文字或图片。', 'Export exceeds 32 MiB. Reduce text or images.'],
    'image-limit': ['图片超过数量、字节或像素限制。', 'Image count, bytes or pixels exceed the limits.'],
    'image-type': ['图片不是支持的静态 PNG、JPEG 或 WebP。', 'Image is not a supported static PNG, JPEG or WebP.'],
    'image-fetch': ['图片加载失败或网站不允许跨域读取。可保留占位继续导出。', 'Image could not be loaded or its website blocks CORS. You can export with a placeholder.'],
    'image-decode': ['无法解码这张图片。', 'Could not decode this image.'],
    'unsafe-url': ['该图片链接协议不受支持。', 'This image URL protocol is unsupported.'],
    cancelled: ['处理已取消。', 'Processing cancelled.'],
    'worker-failed': ['处理器加载或运行失败，源码仍可编辑和下载。', 'Processor failed to load or run. Source editing and download remain available.'],
    'pdf-failed': ['PDF 生成失败，源码已保留，可重试或下载 HTML。', 'PDF generation failed. Source is preserved; retry or download HTML.'],
  };
  const fail = (error: unknown) => {
    if (disposed) return;
    const code = error instanceof Error ? error.message : 'worker-failed';
    const message = errors[code] ?? errors['worker-failed']!;
    ui.status(message[zh ? 0 : 1], true);
  };
  const revokeDownloads = () => { for (const [url, timer] of urlTimers) { clearTimeout(timer); URL.revokeObjectURL(url); } urlTimers.clear(); };
  const clearManualCopy = () => {
    element<HTMLElement>(root, '[data-manual-copy]').hidden = true;
    element<HTMLTextAreaElement>(root, '[data-manual-value]').value = '';
  };
  const cancelExport = () => { exportSequence++; exportSession.cancel(); exportBusy = false; cancelButton.hidden = true; workspace.removeAttribute('aria-busy'); };
  const assetMap = (document: MarkdownDocument): Record<string, string> => Object.fromEntries(document.images.flatMap(image => { const value = assetsByUrl.get(image.url); return value ? [[image.id, value.dataUrl]] : []; }));
  const drawPreview = async (document: MarkdownDocument, at: number) => {
    const assets = assetMap(document);
    const rendered = Object.keys(assets).length ? await parseSession.parse(source.value, assets) : document;
    if (disposed || at !== revision) return;
    doc = rendered;
    // Only the shared sanitized renderer can populate the document surface.
    preview.innerHTML = rendered.html;
    element<HTMLOutputElement>(workspace, '[data-md-count]').textContent = zh ? `${document.characters.toLocaleString()} 字符 · ${document.words.toLocaleString()} 字词` : `${document.characters.toLocaleString()} characters · ${document.words.toLocaleString()} words`;
    outline.replaceChildren();
    for (const heading of document.headings) {
      const button = globalThis.document.createElement('button'); button.type = 'button'; button.textContent = heading.text;
      button.addEventListener('click', () => { preview.querySelector(`#${CSS.escape(heading.id)}`)?.scrollIntoView({ block: 'start' }); if (editor) editor.scrollLine(heading.line); else { source.scrollTop = (heading.line - 1) * parseFloat(getComputedStyle(source).lineHeight); } }); outline.append(button);
    }
    imageList.replaceChildren(); imagePanel.hidden = document.images.length === 0;
    for (const image of document.images) {
      const li = globalThis.document.createElement('li'); const label = globalThis.document.createElement('span');
      label.textContent = `${image.alt || (zh ? '图片' : 'Image')} · ${image.url}${imageFailures.has(image.url) ? ` · ${(errors[imageFailures.get(image.url)!] ?? errors['image-fetch']!)[zh ? 0 : 1]}` : ''}`;
      const button = globalThis.document.createElement('button'); button.type = 'button';
      const loaded = assetsByUrl.has(image.url);
      button.textContent = loaded ? (zh ? '已加载' : 'Loaded') : (zh ? '加载图片' : 'Load image'); button.disabled = loaded || imageBusy;
      button.addEventListener('click', () => { void loadImage(image.url, at); }); li.append(label, button); imageList.append(li);
    }
  };
  const refresh = async () => {
    const at = revision;
    try {
      assertMarkdownSource(source.value);
      const document = await parseSession.parse(source.value);
      if (disposed || at !== revision) return;
      doc = document; parsedRevision = at;
      const currentUrls = new Set(document.images.map(image => image.url));
      for (const url of assetsByUrl.keys()) if (!currentUrls.has(url)) assetsByUrl.delete(url);
      for (const url of imageFailures.keys()) if (!currentUrls.has(url)) imageFailures.delete(url);
      await drawPreview(document, at);
    } catch (error) { if (at === revision && !(error instanceof Error && error.message === 'cancelled')) fail(error); }
  };
  const saveDraft = () => {
    if (!draftCheckbox.checked || disposed) return;
    try { assertMarkdownSource(source.value); draft?.save(source.value); if (!draft) throw new Error('storage'); draftStatus.textContent = zh ? '已保存到此浏览器' : 'Saved in this browser'; }
    catch (error) { clearTimeout(draftTimer); draftCheckbox.checked = false; draftStatus.textContent = error instanceof Error && error.message === 'conflict' ? (zh ? '其他标签已更新草稿，请恢复或重新开启保存。' : 'Another tab updated the draft. Restore it or explicitly enable saving again.') : (zh ? '未保存：浏览器存储不可用或文档超限。' : 'Not saved: storage unavailable or document over limit.'); }
  };
  const changed = (force = false) => {
    if (!force && source.value === lastSource) return;
    lastSource = source.value; revision++; parsedRevision = -1; doc = undefined;
    clearManualCopy();
    clearTimeout(parseTimer); clearTimeout(draftTimer); parseSession.cancel(); cancelExport(); revokeDownloads();
    imageSequence++; assetsAbort.abort(); assetsAbort = new AbortController(); imageBusy = false;
    preview.replaceChildren(); const notice = document.createElement('p'); notice.textContent = zh ? '正在更新预览…' : 'Updating preview…'; notice.className = 'md-empty'; preview.append(notice);
    imageList.replaceChildren(); imagePanel.hidden = true; outline.replaceChildren();
    parseTimer = setTimeout(() => { void refresh(); }, 180);
    if (draftCheckbox.checked) { draftStatus.textContent = zh ? '尚未保存…' : 'Not yet saved…'; draftTimer = setTimeout(saveDraft, 450); }
  };
  source.addEventListener('input', () => changed());
  const replaceSource = (text: string, reset = true) => {
    const identical = text === lastSource;
    if (reset) { assetsByUrl.clear(); imageFailures.clear(); assetsAbort.abort(); filename = ''; }
    if (editor) editor.set(text); else source.value = text;
    if (identical) changed(true); else if (!editor) changed();
  };
  const confirmReplace = () => !source.value || confirm(zh ? '替换当前文档？请先下载需要保留的内容。' : 'Replace this document? Download anything you want to keep first.');
  const enhance = async () => {
    if (editor) return;
    if (enhancing) return enhancing;
    enhancing = (async () => {
      const module = await import('./markdown-editor'); if (disposed) return;
      editor = module.createMarkdownEditor(source, element(workspace, '[data-md-editor]'), changed, syncFromSource);
      element<HTMLButtonElement>(workspace, '[data-md-enhance]').hidden = true;
    })();
    try { await enhancing; } catch { ui.status(zh ? '增强编辑加载失败，基础编辑仍可用。' : 'Enhanced editing could not load. Basic editing remains available.', true); } finally { enhancing = undefined; }
  };
  element(workspace, '[data-md-enhance]').addEventListener('click', () => { void enhance(); });
  workspace.querySelectorAll<HTMLButtonElement>('[data-md-format]').forEach(button => button.addEventListener('click', () => { void (async () => {
    await enhance();
    const before = button.dataset.before ?? ''; const after = button.dataset.after ?? '';
    if (editor) editor.replace(before, after);
    else { const start = source.selectionStart; const end = source.selectionEnd; source.setRangeText(before + source.value.slice(start, end) + after, start, end, 'select'); source.focus(); changed(); }
  })(); }));
  workspace.querySelectorAll<HTMLButtonElement>('[data-md-command]').forEach(button => button.addEventListener('click', () => { void enhance().then(() => editor?.command(button.dataset.mdCommand ?? 'search')); }));
  workspace.querySelectorAll<HTMLButtonElement>('[data-md-mode]').forEach(button => button.addEventListener('click', () => { setMode(button.dataset.mdMode ?? 'source'); if (parsedRevision !== revision) void refresh(); }));
  function setMode(mode: string) { workspace.dataset.mode = mode; workspace.querySelectorAll<HTMLButtonElement>('[data-md-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mdMode === mode))); }
  setMode(matchMedia('(max-width: 800px)').matches ? 'source' : 'split');
  const syncEnabled = () => element<HTMLInputElement>(workspace, '[data-md-sync]').checked && workspace.dataset.mode === 'split' && !syncing && !!doc;
  const lockScroll = () => { syncing = true; clearTimeout(releaseSync); releaseSync = setTimeout(() => { syncing = false; }, 100); };
  function syncFromSource() {
    if (!syncEnabled()) return; lockScroll();
    const line = editor?.topLine() ?? Math.floor(source.scrollTop / parseFloat(getComputedStyle(source).lineHeight)) + 1;
    const blocks = [...preview.querySelectorAll<HTMLElement>('[data-source-line]')];
    const target = blocks.filter(block => Number(block.dataset.sourceLine) <= line).at(-1) ?? blocks[0];
    if (target) preview.scrollTop = target.offsetTop - preview.offsetTop;
  }
  source.addEventListener('scroll', syncFromSource);
  preview.addEventListener('scroll', () => {
    if (!syncEnabled()) return; lockScroll();
    const blocks = [...preview.querySelectorAll<HTMLElement>('[data-source-line]')];
    const target = blocks.find(block => block.getBoundingClientRect().bottom > preview.getBoundingClientRect().top + 10);
    const line = Number(target?.dataset.sourceLine ?? 1);
    if (editor) editor.scrollLine(line); else source.scrollTop = (line - 1) * parseFloat(getComputedStyle(source).lineHeight);
  });
  const fileInput = element<HTMLInputElement>(workspace, '[data-md-file]');
  fileInput.addEventListener('change', () => { const file = fileInput.files?.[0]; fileInput.value = ''; if (!file) return; const at = revision; void (async () => {
    try { if (file.size > markdownPolicy.maxSourceBytes) throw new Error('source-limit'); const text = importMarkdownFile(new Uint8Array(await file.arrayBuffer()), file.name); if (disposed || at !== revision || !confirmReplace()) return; replaceSource(text); filename = file.name; ui.status(zh ? '文件已在本地打开。' : 'File opened locally.'); }
    catch (error) { fail(error); }
  })(); });
  element(workspace, '[data-md-clear]').addEventListener('click', () => { if (confirmReplace()) { replaceSource(''); ui.status(zh ? '文档已清空。' : 'Document cleared.'); } });
  element(workspace, '[data-md-copy]').addEventListener('click', () => { const at = revision; void ui.copy(source.value, () => !disposed && at === revision); });
  cancelButton.addEventListener('click', () => { cancelExport(); imageSequence++; assetsAbort.abort(); assetsAbort = new AbortController(); imageBusy = false; ui.status(zh ? '处理已取消。' : 'Processing cancelled.'); if (doc) void drawPreview(doc, revision); });
  async function loadImage(url: string, at: number) {
    if (imageBusy || at !== revision || !doc) return;
    if (doc.images.length > markdownPolicy.maxImages || assetsByUrl.size >= markdownPolicy.maxImages) { fail(new Error('image-limit')); return; }
    imageBusy = true; cancelButton.hidden = false;
    imageList.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = true; });
    const controller = assetsAbort; const imageToken = ++imageSequence;
    try {
      const { loadMarkdownImage } = await import('./markdown-assets');
      const currentAssets = [...assetsByUrl.values()];
      const image = await loadMarkdownImage(url, controller.signal, { bytes: markdownPolicy.maxTotalImageBytes - currentAssets.reduce((sum, value) => sum + value.bytes, 0), pixels: markdownPolicy.maxTotalImagePixels - currentAssets.reduce((sum, value) => sum + value.pixels, 0) });
      if (disposed || at !== revision || controller.signal.aborted) return;
      const existing = [...assetsByUrl.values()];
      if (existing.reduce((sum, value) => sum + value.bytes, image.bytes) > markdownPolicy.maxTotalImageBytes || existing.reduce((sum, value) => sum + value.pixels, image.pixels) > markdownPolicy.maxTotalImagePixels) throw new Error('image-limit');
      assetsByUrl.set(url, image); imageFailures.delete(url); ui.status(zh ? '图片已在当前文档中加载。' : 'Image loaded for this document.');
    } catch (error) { if (at === revision && imageToken === imageSequence) { imageFailures.set(url, error instanceof Error && errors[error.message] ? error.message : 'image-fetch'); fail(error); } }
    finally { if (at === revision && imageToken === imageSequence && !disposed) { imageBusy = false; cancelButton.hidden = !exportBusy; if (doc) void drawPreview(doc, at); } }
  }
  const download = (blob: Blob, extension: string, title: string) => {
    assertMarkdownOutput(blob.size); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${safeName(filename || title)}.${extension}`; document.body.append(anchor); anchor.click(); anchor.remove();
    urlTimers.set(url, setTimeout(() => { URL.revokeObjectURL(url); urlTimers.delete(url); }, 30000));
  };
  workspace.querySelectorAll<HTMLButtonElement>('[data-md-download]').forEach(button => button.addEventListener('click', () => { void exportDocument(button.dataset.mdDownload ?? 'md'); }));
  async function exportDocument(kind: string) {
    const at = revision;
    if (kind === 'md') { try { download(new Blob([source.value], { type: 'text/markdown;charset=utf-8' }), 'md', doc?.title ?? 'document'); ui.status(zh ? '已发起 Markdown 下载。' : 'Markdown download started.'); } catch (error) { fail(error); } return; }
    if (exportBusy) return;
    exportBusy = true; const token = ++exportSequence; const currentJob = () => at === revision && token === exportSequence && exportBusy && !disposed; cancelButton.hidden = false; workspace.setAttribute('aria-busy', 'true');
    try {
      assertMarkdownSource(source.value);
      if (parsedRevision !== at) await refresh();
      if (!currentJob() || !doc) return;
      const snapshot = doc; const text = source.value; const assets = assetMap(snapshot);
      const missing = snapshot.images.filter(image => !assets[image.id]);
      const missingDetails = missing.slice(0, 10).map(image => `${image.alt || 'Image'}: ${image.url}\n${imageFailures.has(image.url) ? (errors[imageFailures.get(image.url)!] ?? errors['image-fetch']!)[zh ? 0 : 1] : (zh ? '尚未授权或加载。' : 'Not authorized or loaded.')}`).join('\n\n');
      if (missing.length && !confirm((zh ? `${missing.length} 张图片无法嵌入。保留占位继续导出？详情见外部图片列表。` : `${missing.length} image(s) cannot be embedded. Continue with placeholders? See External images for all details.`) + `\n\n${missingDetails}`)) return;
      if (kind === 'html') {
        const html = await exportSession.html(text, assets, locale);
        if (!currentJob()) return;
        download(new Blob([html], { type: 'text/html;charset=utf-8' }), 'html', snapshot.title);
      } else {
        ui.status(zh ? '正在加载 PDF 组件与中文字体…' : 'Loading PDF components and Chinese font…');
        const bytes = await exportSession.pdf(text, assets, new URL(`${import.meta.env.BASE_URL}markdown-fonts/`, location.origin).href, phase => { if (at === revision) ui.status(phase === 'font' ? (zh ? '正在加载中文字体…' : 'Loading Chinese font…') : (zh ? '正在排版并生成 PDF…' : 'Laying out and generating PDF…')); });
        if (!currentJob()) return;
        download(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), 'pdf', snapshot.title);
      }
      ui.status(zh ? '已发起下载，请检查浏览器保存结果。' : 'Download started. Check the browser save result.');
    } catch (error) { if (currentJob()) fail(error); }
    finally { if (currentJob()) cancelExport(); }
  }
  element(workspace, '[data-md-print]').addEventListener('click', () => { void (async () => {
    const at = revision;
    try {
      if (parsedRevision !== at) await refresh(); if (!doc || at !== revision || disposed) return;
      const assets = assetMap(doc);
      if (doc.images.some(image => !assets[image.id]) && !confirm(zh ? '部分图片尚未加载，保留占位继续打印？' : 'Some images are not loaded. Print with placeholders?')) return;
      if (at !== revision || disposed) return;
      printCleanup?.();
      const body = document.createElement('article'); body.className = 'md-document'; body.setAttribute('data-md-print-body', ''); body.innerHTML = doc.html; document.body.append(body); document.body.classList.add('md-printing');
      const cleanup = () => { document.body.classList.remove('md-printing'); body.remove(); window.removeEventListener('afterprint', cleanup); printCleanup = undefined; };
      printCleanup = cleanup; window.addEventListener('afterprint', cleanup, { once: true }); window.print();
    } catch (error) { fail(error); }
  })(); });
  const getDraft = () => draft ??= new MarkdownDraftStore(localStorage);
  draftCheckbox.addEventListener('change', () => {
    clearTimeout(draftTimer);
    try { if (draftCheckbox.checked) { getDraft().enable(); saveDraft(); } else { getDraft().disable(); draftStatus.textContent = zh ? '已关闭并删除本地草稿，当前文档仍保留。' : 'Draft saving off and local draft removed. Current document is preserved.'; } }
    catch { draftCheckbox.checked = false; draftStatus.textContent = zh ? '浏览器存储不可用，未保存。' : 'Browser storage unavailable. Not saved.'; }
  });
  element(workspace, '[data-md-restore]').addEventListener('click', () => {
    try { const saved = getDraft().read(); if (!saved) { draftStatus.textContent = zh ? '没有可恢复的本地草稿。' : 'No local draft to restore.'; return; } if (!confirmReplace()) return; clearTimeout(draftTimer); replaceSource(saved.source); getDraft().enable(); draftCheckbox.checked = true; draftStatus.textContent = zh ? '已恢复本地草稿，图片仍需主动加载。' : 'Local draft restored. Images still need permission.'; }
    catch { draftStatus.textContent = zh ? '无法恢复：草稿损坏、超限或存储不可用。' : 'Could not restore: invalid/oversized draft or storage unavailable.'; }
  });
  element(workspace, '[data-md-delete]').addEventListener('click', () => {
    clearTimeout(draftTimer); draftCheckbox.checked = false;
    try { getDraft().disable(); draftStatus.textContent = zh ? '本地草稿已删除，当前文档仍保留。' : 'Local draft deleted. Current document is preserved.'; } catch { draftStatus.textContent = zh ? '未能删除本地草稿，请检查浏览器存储设置。' : 'Could not delete the local draft. Check browser storage settings.'; }
  });
  const storageChanged = (event: StorageEvent) => { if (event.key === markdownDraftKey) { clearTimeout(draftTimer); draftCheckbox.checked = false; draftStatus.textContent = zh ? '其他标签更新了草稿，请恢复或重新开启保存。' : 'Another tab changed the draft. Restore it or explicitly enable saving again.'; } };
  window.addEventListener('storage', storageChanged);
  const exitExpanded = () => { if (document.fullscreenElement === workspace) void document.exitFullscreen(); workspace.classList.remove('is-expanded'); workspace.removeAttribute('role'); workspace.removeAttribute('aria-modal'); expanded = false; element<HTMLButtonElement>(workspace, '[data-md-expand]').setAttribute('aria-expanded', 'false'); element<HTMLElement>(workspace, '[data-md-exit]').hidden = true; expandedFocus?.focus(); };
  element(workspace, '[data-md-expand]').addEventListener('click', () => { if (expanded) { exitExpanded(); return; } expandedFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null; expanded = true; workspace.classList.add('is-expanded'); workspace.setAttribute('role', 'dialog'); workspace.setAttribute('aria-modal', 'true'); element<HTMLButtonElement>(workspace, '[data-md-expand]').setAttribute('aria-expanded', 'true'); element<HTMLElement>(workspace, '[data-md-exit]').hidden = false; if (workspace.requestFullscreen) void workspace.requestFullscreen().catch(() => {}); element<HTMLButtonElement>(workspace, '[data-md-exit]').focus(); });
  element(workspace, '[data-md-exit]').addEventListener('click', exitExpanded);
  workspace.addEventListener('keydown', event => {
    if (!expanded) return; if (event.key === 'Escape') { event.preventDefault(); exitExpanded(); }
    if (event.key === 'Tab') { const controls = [...workspace.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea,[tabindex="0"]')].filter(control => control.getClientRects().length); const first = controls[0]; const last = controls.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
  });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && expanded) exitExpanded(); });
  window.addEventListener('pagehide', () => {
    disposed = true; printCleanup?.(); printCleanup = undefined;
    clearTimeout(parseTimer); clearTimeout(draftTimer); clearTimeout(releaseSync);
    parseSession.cancel(); cancelExport(); assetsAbort.abort();
    assetsByUrl.clear(); imageFailures.clear(); revokeDownloads(); editor?.destroy();
    editor = undefined; doc = undefined; draft = undefined; lastSource = ''; filename = '';
    source.value = ''; preview.replaceChildren(); outline.replaceChildren(); imageList.replaceChildren();
    clearManualCopy(); expandedFocus = null;
    window.removeEventListener('storage', storageChanged);
  }, { once: true });
}
