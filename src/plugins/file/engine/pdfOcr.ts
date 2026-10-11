import type { PDFPageProxy } from "pdfjs-dist";
import type { OcrPageResult } from "../../../core/ocr/contracts.js";
import type { PdfTextSample } from "./pdfComplexity.js";

export interface RasterPage { bytes: Uint8Array; width: number; height: number; blank: boolean; downsampled: boolean }
export function ocrTextSamples(result: OcrPageResult, pageWidth: number, pageHeight: number): PdfTextSample[] {
  if (!Number.isFinite(pageWidth) || !Number.isFinite(pageHeight) || pageWidth <= 0 || pageHeight <= 0 || !Number.isInteger(result.width) || !Number.isInteger(result.height) || result.width > 8192 || result.height > 8192 || result.width*result.height > 24_000_000 || result.width <= 0 || result.height <= 0 || result.lines.length > 10_000) throw new Error("providerFailed");
  return result.lines.filter(line => line.text.trim()).map(line => {
    const b = line.bounds;
    if (![b.x,b.y,b.width,b.height,line.confidence].every(Number.isFinite) || b.x < 0 || b.y < 0 || b.width <= 0 || b.height <= 0 || !(line.confidence >= 0 && line.confidence <= 1) || b.x+b.width > result.width+0.01 || b.y+b.height > result.height+0.01) throw new Error("providerFailed");
    return { text: line.text, x: b.x * pageWidth / result.width, y: b.y * pageHeight / result.height, width: b.width * pageWidth / result.width, height: b.height * pageHeight / result.height, rotationDegrees: 0 };
  });
}
export async function rasterizeOcrPage(page: PDFPageProxy, signal: AbortSignal): Promise<RasterPage> {
  const size = page.getViewport({ scale: 1 });
  const desired = 200 / 72;
  const scale = Math.min(desired, 8192 / size.width, 8192 / size.height, Math.sqrt(24_000_000 / (size.width * size.height)));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
  let cancel: (() => void) | undefined;
  try {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context || !canvas.width || !canvas.height) throw new Error("providerFailed");
    // The engine WebView is hidden: display rendering waits for animation frames that may never run.
    const render = page.render({ canvas, canvasContext: context, viewport, background: "white", intent: "print" });
    cancel = () => render.cancel();
    signal.addEventListener("abort", cancel, { once: true });
    await render.promise;
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    const pixels = context.getImageData(0,0,canvas.width,canvas.height).data;
    let ink = 0;
    for (let index = 0; index < pixels.length; index += 4) if (pixels[index] < 245 || pixels[index+1] < 245 || pixels[index+2] < 245) { if (++ink > 8) break; }
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    if (!blob || blob.size > 32 * 1024 * 1024) throw new Error("providerFailed");
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height, blank: ink <= 8, downsampled: scale < desired };
  } finally { if (cancel) signal.removeEventListener("abort", cancel); canvas.width = 0; canvas.height = 0; }
}
