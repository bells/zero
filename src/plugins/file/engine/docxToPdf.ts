import { renderAsync } from "docx-preview";
import { nativePrintGeometry } from "./nativePrintLayout";
import type { FileEngineRenderMeasurement } from "./engineContracts";

const RESOURCE_TIMEOUT_MS = 15_000;
const MAX_IMAGE_DECODE_CONCURRENCY = 4;

export async function renderDocxForNativePrint(
  bytes: Uint8Array,
  request: Pick<
    FileEngineRenderMeasurement,
    "protocolVersion" | "token" | "engineVersion" | "jobId"
  >,
  signal: AbortSignal,
  platform: "macos" | "windows" | "unsupported" = "macos",
  deadlineMs = Date.now() + 120_000,
  onFontsReady?: (loadedFamilies: string[]) => void,
): Promise<FileEngineRenderMeasurement> {
  const root = engineDocumentRoot();
  document.body.classList.remove("zero-file-engine-export", "zero-file-engine-macos", "zero-file-engine-windows");
  document.body.classList.add("zero-file-engine-layout");
  root.replaceChildren();
  root.className = "zero-file-engine-document";
  // docx-preview cannot cancel its asynchronous work; detach each run's container during cleanup.
  const renderSurface = document.createElement("div");
  root.append(renderSurface);

  await withTimeout(renderAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), renderSurface, renderSurface, {
    className: "zero-file-docx",
    inWrapper: true,
    ignoreWidth: false,
    ignoreHeight: false,
    ignoreFonts: false,
    breakPages: true,
    ignoreLastRenderedPageBreak: false,
    useBase64URL: true,
    renderHeaders: true,
    renderFooters: true,
    renderFootnotes: true,
    renderEndnotes: true,
    renderAltChunks: false,
  }), Math.min(RESOURCE_TIMEOUT_MS, deadlineMs-Date.now()), "timeout", signal);
  assertNotCancelled(signal);
  await withTimeout(waitForImages(renderSurface, signal), Math.min(RESOURCE_TIMEOUT_MS, deadlineMs-Date.now()), "timeout", signal);
  if (document.fonts) {
    await withTimeout(document.fonts.ready, Math.min(RESOURCE_TIMEOUT_MS, deadlineMs-Date.now()), "timeout", signal);
  }
  assertNotCancelled(signal);
  onFontsReady?.(document.fonts ? [...document.fonts].filter(face => face.status === "loaded").map(face => face.family.replace(/^["']|["']$/g, "")) : []);

  void root.offsetHeight;
  const sections = [...renderSurface.querySelectorAll<HTMLElement>("section.zero-file-docx")];
  const sectionCount = Math.max(1, sections.length);
  const pageRects = nativePrintGeometry(platform, measurePageRects(renderSurface, sections));
  document.body.classList.add("zero-file-engine-export", `zero-file-engine-${platform}`);
  void root.offsetHeight;
  const measuredPageCount = pageRects.length;
  return {
    protocolVersion: request.protocolVersion,
    token: request.token,
    engineVersion: request.engineVersion,
    jobId: request.jobId,
    sectionCount,
    measuredPageCount,
    pageRects,
  };
}

function measurePageRects(root: HTMLElement, sections: HTMLElement[]) {
  const candidates = sections.length > 0 ? sections : [root];
  return candidates.flatMap((section) => {
    const bounds = section.getBoundingClientRect();
    const style = window.getComputedStyle(section);
    const pageWidth = Math.max(1, bounds.width || Number.parseFloat(style.width));
    const declaredPageHeight = Number.parseFloat(style.minHeight);
    const pageHeight = Math.max(
      1,
      declaredPageHeight || bounds.height || window.innerHeight,
    );
    const contentHeight = Math.max(
      pageHeight,
      bounds.height,
      section.scrollHeight,
      sections.length === 1 ? root.scrollHeight : 0,
    );
    const pageCount = Math.max(1, Math.ceil(contentHeight / pageHeight));
    return Array.from({ length: pageCount }, (_, index) => ({
      x: Math.max(0, bounds.left + window.scrollX),
      y: Math.max(0, bounds.top + window.scrollY + index * pageHeight),
      width: pageWidth,
      height: pageHeight,
    }));
  });
}

function engineDocumentRoot() {
  const existing = document.getElementById("zero-file-engine-document");
  if (existing instanceof HTMLElement) return existing;
  const root = document.createElement("main");
  root.id = "zero-file-engine-document";
  document.body.append(root);
  return root;
}

export function clearDocxRenderSurface() {
  document.body.classList.remove("zero-file-engine-export", "zero-file-engine-layout", "zero-file-engine-macos", "zero-file-engine-windows");
  const root = document.getElementById("zero-file-engine-document");
  if (root instanceof HTMLElement) {
    root.replaceChildren();
    root.className = "zero-file-engine-document";
  }
}

async function waitForImages(root: HTMLElement, signal: AbortSignal) {
  const images = [...root.querySelectorAll("img")];
  let nextIndex = 0;
  await Promise.all(Array.from(
    { length: Math.min(MAX_IMAGE_DECODE_CONCURRENCY, images.length) },
    async () => {
      while (nextIndex < images.length) {
        const image = images[nextIndex];
        nextIndex += 1;
        assertNotCancelled(signal);
        if (image.complete) {
          if (image.naturalWidth === 0 || image.naturalHeight === 0) {
            throw new Error("An embedded image could not be decoded.");
          }
          continue;
        }
        await image.decode();
        assertNotCancelled(signal);
      }
    }
  ));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string, signal: AbortSignal) {
  assertNotCancelled(signal);
  if (timeoutMs <= 0) throw new Error("timeout");
  let onAbort: (() => void) | undefined;
  let timer: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve,reject) => { onAbort=()=>reject(new DOMException("Conversion cancelled.", "AbortError")); signal.addEventListener("abort",onAbort,{once:true}); }),
      new Promise<never>((_resolve, reject) => {
        timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
    if (onAbort) signal.removeEventListener("abort",onAbort);
  }
}

function assertNotCancelled(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Conversion cancelled.", "AbortError");
}
