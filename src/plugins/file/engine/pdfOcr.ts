import type { PDFPageProxy } from "pdfjs-dist";
import type { OcrPageResult } from "../../../core/ocr/contracts.js";
import type { PdfTextSample } from "./pdfComplexity.js";
import { PdfReconstructionError } from "./pdfComplexity.js";
import { contains, type PdfBounds } from "./pdfGeometry.js";
export interface RasterPage {
    bytes: Uint8Array;
    width: number;
    height: number;
    blank: boolean;
    downsampled: boolean;
    pixels?: Uint8ClampedArray;
}
export interface FileOcrRegion {
    id: number;
    bounds: PdfBounds;
    pageWidth: number;
    pageHeight: number;
}
export function ocrTextSamples(result: OcrPageResult, pageWidth: number, pageHeight: number): PdfTextSample[] {
    if (!Number.isFinite(pageWidth) || !Number.isFinite(pageHeight) || pageWidth <= 0 || pageHeight <= 0 || !Number.isInteger(result.width) || !Number.isInteger(result.height) || result.width > 8192 || result.height > 8192 || result.width * result.height > 24000000 || result.width <= 0 || result.height <= 0 || result.lines.length > 10000)
        throw new Error("providerFailed");
    return result.lines.filter(line => line.text.trim()).map(line => {
        const b = line.bounds;
        if (![b.x, b.y, b.width, b.height, line.confidence].every(Number.isFinite) || b.x < 0 || b.y < 0 || b.width <= 0 || b.height <= 0 || !(line.confidence >= 0 && line.confidence <= 1) || b.x + b.width > result.width + 0.01 || b.y + b.height > result.height + 0.01)
            throw new Error("providerFailed");
        return { text: line.text, x: b.x * pageWidth / result.width, y: b.y * pageHeight / result.height, width: b.width * pageWidth / result.width, height: b.height * pageHeight / result.height, rotationDegrees: 0 };
    });
}
export async function rasterizeOcrPage(page: PDFPageProxy, signal: AbortSignal, region?: PdfBounds): Promise<RasterPage> {
    const size = page.getViewport({ scale: 1 });
    const bounds = region ?? { x: 0, y: 0, width: size.width, height: size.height };
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0 || !contains({ x: 0, y: 0, width: size.width, height: size.height }, bounds, 0))
        throw new PdfReconstructionError("unsupportedInput");
    const desired = 200 / 72;
    const scale = Math.min(desired, 8192 / bounds.width, 8192 / bounds.height, Math.sqrt(24000000 / (bounds.width * bounds.height)));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(bounds.width * scale);
    canvas.height = Math.floor(bounds.height * scale);
    let cancel: (() => void) | undefined;
    try {
        if (signal.aborted)
            throw new DOMException("Cancelled", "AbortError");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context || !canvas.width || !canvas.height)
            throw new Error("providerFailed");
        // The engine WebView is hidden: display rendering waits for animation frames that may never run.
        const render = page.render({ canvas, canvasContext: context, viewport, transform: [1, 0, 0, 1, -bounds.x * scale, -bounds.y * scale], background: "white", intent: "print" });
        cancel = () => render.cancel();
        signal.addEventListener("abort", cancel, { once: true });
        await render.promise;
        if (signal.aborted)
            throw new DOMException("Cancelled", "AbortError");
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let ink = 0;
        for (let index = 0; index < pixels.length; index += 4)
            if (pixels[index] < 245 || pixels[index + 1] < 245 || pixels[index + 2] < 245) {
                if (++ink > 8)
                    break;
            }
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
        if (signal.aborted)
            throw new DOMException("Cancelled", "AbortError");
        if (!blob || blob.size > 32 * 1024 * 1024)
            throw new Error("providerFailed");
        return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height, blank: ink <= 8, downsampled: scale < desired, pixels };
    }
    finally {
        if (cancel)
            signal.removeEventListener("abort", cancel);
        canvas.width = 0;
        canvas.height = 0;
    }
}
/** Unrecognized ink is never silently discarded along with a scan background. */
export function scanResidualRegions(raster: Pick<RasterPage, "width" | "height" | "pixels">, result: OcrPageResult, coverage?: { figures: PdfBounds[]; reflow: boolean }): PdfBounds[] {
    const { width, height, pixels } = raster;
    if (!pixels)
        return [];
    if (pixels.length !== width * height * 4 || result.width !== width || result.height !== height)
        throw new Error("providerFailed");
    const step = Math.max(1, Math.ceil(Math.max(width, height) / 1400));
    const columns = Math.ceil(width / step), rows = Math.ceil(height / step), ink = new Uint8Array(columns * rows);
    const masked = new Uint8Array(ink.length);
    const masks = result.lines.map(line => ({ bounds: line.bounds, padding: Math.max(4, line.bounds.height * .35) }));
    masks.push(...(coverage?.figures ?? []).map(bounds => ({ bounds, padding: 0 })));
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const index = (y * width + x) * 4;
            if (pixels[index] >= 235 && pixels[index + 1] >= 235 && pixels[index + 2] >= 235)
                continue;
            ink[Math.floor(y / step) * columns + Math.floor(x / step)] = 1;
        }
    for (const { bounds: box, padding } of masks) {
        const x0 = Math.max(0, Math.floor((box.x - padding) / step)), y0 = Math.max(0, Math.floor((box.y - padding) / step));
        const x1 = Math.min(columns, Math.ceil((box.x + box.width + padding) / step)), y1 = Math.min(rows, Math.ceil((box.y + box.height + padding) / step));
        for (let y = y0; y < y1; y++) {
            ink.fill(0, y * columns + x0, y * columns + x1);
            masked.fill(1, y * columns + x0, y * columns + x1);
        }
    }
    const regions: PdfBounds[] = [];
    const queue: number[] = [];
    const textHeight = result.lines.reduce((sum, line) => sum + line.bounds.height, 0) / Math.max(1, result.lines.length);
    if (coverage?.reflow) {
        // Straight rules can join a small colored heading tab to the entire page.
        // Remove only long uninterrupted runs, leaving glyphs and shaded cells for coverage checks.
        for (let y = 0; y < rows; y++) {
            let start = 0;
            for (let x = 0; x <= columns; x++) {
                if (x < columns && ink[y * columns + x]) continue;
                if ((x - start) * step >= Math.max(width * .3, textHeight * 8)) ink.fill(0, y * columns + start, y * columns + x);
                start = x + 1;
            }
        }
    }
    for (let first = 0; first < ink.length; first++) {
        if (!ink[first])
            continue;
        queue.length = 0;
        queue.push(first);
        ink[first] = 0;
        let minX = columns, minY = rows, maxX = 0, maxY = 0;
        for (let i = 0; i < queue.length; i++) {
            const n = queue[i], x = n % columns, y = Math.floor(n / columns);
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
            for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= columns || ny >= rows)
                    continue;
                const neighbor = ny * columns + nx;
                if (ink[neighbor]) {
                    ink[neighbor] = 0;
                    queue.push(neighbor);
                }
            }
        }
        if (queue.length * step * step <= 8)
            continue;
        const bounds = { x: minX * step, y: minY * step, width: Math.min(width, (maxX + 1) * step) - minX * step, height: Math.min(height, (maxY + 1) * step) - minY * step };
        if (coverage?.reflow && scanDecoration()) continue;
        if ((!coverage?.reflow && (bounds.width < 40 || bounds.height < Math.max(30, textHeight * 2))) || regions.length >= 256)
            throw new PdfReconstructionError("unsupportedInput");
        regions.push(bounds);

        function scanDecoration(): boolean {
            if (bounds.width >= Math.max(24, textHeight * 1.2) && bounds.height <= step * 2) return true;
            if (bounds.width >= Math.max(40, textHeight * 8) && bounds.height <= Math.max(3, step * 2, textHeight * .3)) return true;
            // A flat colored polygon may reflow with page decoration. Glyph-sized or
            // textured components still require recognition or an independently placed photo.
            if (bounds.width < textHeight * .4 || bounds.height < textHeight * .5 || bounds.height > textHeight * 2.5 || queue.length * step * step < bounds.width * bounds.height * .45) return false;
            const colors = [0, 0, 0], ranges = [1, 1, 1];
            let chromatic = 0;
            const rowSpans = new Map<number, { min: number; max: number; count: number }>();
            for (const n of queue) {
                const x = n % columns, y = Math.floor(n / columns);
                let rgb = [255, 255, 255];
                for (let dy = 0; dy < step && y * step + dy < height; dy++)
                    for (let dx = 0; dx < step && x * step + dx < width; dx++) {
                        const pixel = ((y * step + dy) * width + x * step + dx) * 4;
                        const candidate = [pixels![pixel], pixels![pixel + 1], pixels![pixel + 2]];
                        if (Math.min(...candidate) < Math.min(...rgb)) rgb = candidate;
                    }
                const min = Math.min(...rgb), range = Math.max(...rgb) - min;
                if (range >= 6) {
                    chromatic++;
                    // Low-chroma JPEG edge pixels carry unstable hue, so only the
                    // saturated interior establishes the polygon's uniform color.
                    if (range >= 20)
                        for (let c = 0; c < 3; c++) { const hue = (rgb[c] - min) / range; colors[c] = Math.max(colors[c], hue); ranges[c] = Math.min(ranges[c], hue); }
                }
                const span = rowSpans.get(y) ?? { min: x, max: x, count: 0 };
                span.min = Math.min(span.min, x); span.max = Math.max(span.max, x); span.count++;
                rowSpans.set(y, span);
            }
            return chromatic > queue.length * .8 && colors.every((color, index) => color - ranges[index] < .65) && [...rowSpans.entries()].every(([y, row]) => {
                let covered = row.count;
                for (let x = row.min; x <= row.max; x++) covered += masked[y * columns + x];
                return row.max - row.min + 1 <= covered + Math.max(1, Math.ceil(textHeight * .2 / step));
            });
        }
    }
    return regions;
}
