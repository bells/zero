import { GlobalWorkerOptions, ImageKind, OPS, PasswordResponses, getDocument, type PDFPageProxy } from "pdfjs-dist";
import { PdfReconstructionError, reconstructPdfPage, type PdfTextSample } from "./pdfComplexity.js";
import { assertNotCancelled, writeEditableDocx, type PdfDocxPage, type PdfEditableImage } from "./editableDocx.js";

export { FileEngineCancelledError } from "./editableDocx.js";

export interface PdfToDocxProgress {
  stage: "parsing" | "analyzing" | "rendering" | "packaging";
  percent?: number;
}
export interface PdfToDocxResult {
  bytes: Uint8Array;
  qualityProfile: "editableReconstruction";
  warningKeys: string[];
  pageCount: number;
}
export interface PdfToDocxOptions {
  assetBaseUrl?: string;
  deadlineMs?: number;
  writeDocx?: typeof writeEditableDocx;
}

export async function convertPdfToDocx(
  bytes: Uint8Array,
  signal: AbortSignal,
  onProgress: (progress: PdfToDocxProgress) => Promise<void>,
  options: PdfToDocxOptions = {},
): Promise<PdfToDocxResult> {
  const deadline = options.deadlineMs ?? Date.now() + 120_000;
  const check = () => {
    assertNotCancelled(signal);
    if (Date.now() >= deadline) throw new Error("timeout");
  };
  check();
  const base = options.assetBaseUrl ?? new URL("./file-engine/", document.baseURI).toString();
  GlobalWorkerOptions.workerSrc = new URL("pdf.worker.min.mjs", base).toString();
  const loadingTask = getDocument({
    data: bytes,
    cMapUrl: new URL("cmaps/", base).toString(), cMapPacked: true,
    standardFontDataUrl: new URL("standard_fonts/", base).toString(),
    wasmUrl: new URL("wasm/", base).toString(), useWasm: true,
  });
  let passwordRequired = false;
  loadingTask.onPassword = (_updatePassword: (password: string) => void, reason: number) => {
    passwordRequired = reason === PasswordResponses.NEED_PASSWORD || reason === PasswordResponses.INCORRECT_PASSWORD;
    void loadingTask.destroy();
  };
  const abort = () => { void loadingTask.destroy(); };
  signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, Math.max(1, deadline - Date.now()));
  const pages: PdfDocxPage[] = [];
  try {
    await onProgress({ stage: "parsing", percent: 2 });
    const pdf = await loadingTask.promise;
    check();
    if (pdf.numPages > 512) throw new PdfReconstructionError("unsupportedInput");
    let totalCharacters = 0;
    let totalImageBytes = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      check();
      const page = await pdf.getPage(pageNumber);
      try {
        if (page.rotate % 360 !== 0) throw new PdfReconstructionError("unsupportedInput");
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        check();
        const operators = await page.getOperatorList();
        check();
        const text = content.items.flatMap<PdfTextSample>((item) => {
          if (!("str" in item) || item.str.trim().length === 0) return [];
          const [a, b, , d, x, y] = item.transform;
          const family = content.styles[item.fontName]?.fontFamily;
          return [{
            text: item.str, x, y: viewport.height - y, width: Math.abs(item.width),
            height: Math.max(Math.abs(d), Math.abs(item.height), 1),
            rotationDegrees: Math.atan2(b, a) * (180 / Math.PI), fontFamily: family,
            bold: /bold/i.test(family ?? ""), italic: /italic|oblique/i.test(family ?? ""),
          }];
        });
        totalCharacters += text.reduce((sum, item) => sum + item.text.length, 0);
        if (totalCharacters > 5_000_000) throw new PdfReconstructionError("unsupportedInput");
        const imageOperations = operators.fnArray.flatMap((operation, index) =>
          [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageXObjectRepeat,
            OPS.paintImageMaskXObject, OPS.paintImageMaskXObjectRepeat, OPS.paintImageMaskXObjectGroup].includes(operation)
            ? [{ operation, args: operators.argsArray[index] as unknown }] : []);
        const model = reconstructPdfPage({
          width: viewport.width, height: viewport.height, text, imageCount: imageOperations.length,
          vectorOperationCount: operators.fnArray.filter((operation) => operation === OPS.constructPath || operation === OPS.paintFormXObjectBegin).length,
        });
        const images: PdfEditableImage[] = [];
        const seen = new Set<string>();
        for (const { operation, args } of imageOperations) {
          check();
          if (!Array.isArray(args)) throw new PdfReconstructionError("unsupportedInput");
          if (![OPS.paintImageXObject, OPS.paintInlineImageXObject].includes(operation)) {
            throw new PdfReconstructionError("unsupportedInput");
          }
          const value: unknown = operation === OPS.paintImageXObject
            ? await imageObject(page, args[0], signal, Math.min(10_000, deadline - Date.now())) : args[0];
          if (typeof args[0] === "string") {
            if (seen.has(args[0])) continue;
            seen.add(args[0]);
          }
          const image = await encodePdfImage(value);
          check();
          totalImageBytes += image.data.byteLength;
          if (totalImageBytes > 64 * 1024 * 1024) throw new PdfReconstructionError("unsupportedInput");
          images.push(image);
        }
        pages.push({ ...model, images });
      } finally { page.cleanup(); }
      await onProgress({ stage: "analyzing", percent: Math.round((pageNumber / pdf.numPages) * 85) });
    }
    if (!pages.some((page) => page.paragraphs.length > 0)) throw new PdfReconstructionError("unsupportedInput");
    check();
    await onProgress({ stage: "packaging", percent: 90 });
    const output = await (options.writeDocx ?? writeEditableDocx)(pages, signal);
    check();
    return {
      bytes: output, qualityProfile: "editableReconstruction", pageCount: pdf.numPages,
      warningKeys: [...new Set(["file.quality.editableReconstructionWarning", ...pages.flatMap((page) => page.warningKeys)])],
    };
  } catch (error) {
    check();
    if (passwordRequired) throw new Error("passwordRequired");
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
    pages.forEach((page) => page.images.forEach((image) => image.data.fill(0)));
    await loadingTask.destroy();
  }
}

function imageObject(page: PDFPageProxy, id: unknown, signal: AbortSignal, deadline: number): Promise<unknown> {
  if (typeof id !== "string") throw new PdfReconstructionError("unsupportedInput");
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", cancel); };
    const cancel = () => { cleanup(); try { assertNotCancelled(signal); } catch (error) { reject(error); } };
    const timer = setTimeout(() => { cleanup(); reject(new Error("timeout")); }, Math.max(1, deadline));
    signal.addEventListener("abort", cancel, { once: true });
    (id.startsWith("g_") ? page.commonObjs : page.objs).get(id, (value: unknown) => { cleanup(); resolve(value); });
    if (signal.aborted) cancel();
  });
}

async function encodePdfImage(value: unknown): Promise<PdfEditableImage> {
  if (!value || typeof value !== "object" || !("width" in value) || !("height" in value) ||
      typeof value.width !== "number" || typeof value.height !== "number" ||
      !Number.isInteger(value.width) || !Number.isInteger(value.height) || value.width <= 0 || value.height <= 0 ||
      value.width * value.height > 12_000_000) throw new PdfReconstructionError("unsupportedInput");
  const { width, height } = value;
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image encoding unavailable.");
    if ("bitmap" in value && typeof ImageBitmap !== "undefined" && value.bitmap instanceof ImageBitmap) {
      context.drawImage(value.bitmap, 0, 0);
    } else if ("data" in value && (value.data instanceof Uint8Array || value.data instanceof Uint8ClampedArray) && "kind" in value) {
      const expectedBytes = value.kind === ImageKind.RGBA_32BPP ? width * height * 4
        : value.kind === ImageKind.RGB_24BPP ? width * height * 3
          : value.kind === ImageKind.GRAYSCALE_1BPP ? Math.ceil(width / 8) * height : -1;
      if (value.data.byteLength !== expectedBytes) throw new PdfReconstructionError("unsupportedInput");
      const rgba = new Uint8ClampedArray(width * height * 4);
      for (let index = 0; index < width * height; index += 1) {
        if (value.kind === ImageKind.RGBA_32BPP) rgba.set(value.data.subarray(index * 4, index * 4 + 4), index * 4);
        else if (value.kind === ImageKind.RGB_24BPP) {
          rgba.set(value.data.subarray(index * 3, index * 3 + 3), index * 4); rgba[index * 4 + 3] = 255;
        } else if (value.kind === ImageKind.GRAYSCALE_1BPP) {
          const gray = value.data[Math.floor(index / width) * Math.ceil(width / 8) + Math.floor((index % width) / 8)] & (128 >> (index % width % 8)) ? 255 : 0;
          rgba.set([gray, gray, gray, 255], index * 4);
        } else throw new PdfReconstructionError("unsupportedInput");
      }
      context.putImageData(new ImageData(rgba, width, height), 0, 0);
    } else throw new PdfReconstructionError("unsupportedInput");
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((encoded) => encoded ? resolve(encoded) : reject(new Error("Image encoding failed.")), "image/png");
    });
    return { data: new Uint8Array(await blob.arrayBuffer()), width, height };
  } finally { canvas.width = 1; canvas.height = 1; }
}
