import type { OcrPageResult } from "../../../core/ocr/contracts.js";
import { PdfReconstructionError } from "./pdfComplexity.js";
import type { PdfImagePlacement } from "./pdfDrawing.js";
import { contains, intersects, type PdfBounds } from "./pdfGeometry.js";
import { ocrTextSamples, scanResidualRegions, type RasterPage } from "./pdfOcr.js";

interface ScanOptions {
    raster: RasterPage;
    width: number;
    height: number;
    images: PdfImagePlacement[];
    recognize: (raster: RasterPage, bounds: PdfBounds) => Promise<OcrPageResult>;
    rasterize: (bounds: PdfBounds) => Promise<RasterPage>;
}

/** Composite image pages must be recognized after PDF clipping and occlusion. */
export async function recognizeCompositeScan(options: ScanOptions): Promise<{ result: OcrPageResult; figures: PdfImagePlacement[] }> {
    const { raster, width, height } = options;
    const pageBounds = { x: 0, y: 0, width, height };
    let result = await options.recognize(raster, pageBounds);
    ocrTextSamples(result, width, height);
    if (!result.lines.some(line => line.text.trim()) || !raster.pixels)
        throw new PdfReconstructionError("unsupportedInput");
    const toPixels = (box: PdfBounds): PdfBounds => ({ x: box.x * raster.width / width, y: box.y * raster.height / height, width: box.width * raster.width / width, height: box.height * raster.height / height });
    const toPoints = (box: PdfBounds): PdfBounds => ({ x: box.x * width / raster.width, y: box.y * height / raster.height, width: box.width * width / raster.width, height: box.height * height / raster.height });
    const figures = options.images.filter(image => {
        const box = toPixels(image.bounds);
        return contains(pageBounds, image.bounds, .1) && image.bounds.width * image.bounds.height < width * height * .15 &&
            !result.lines.some(line => intersects(line.bounds, box)) && photographicRegion(raster, box);
    });
    const coverage = { figures: figures.map(image => toPixels(image.bounds)), reflow: true };
    const residuals = scanResidualRegions(raster, result, coverage);
    const regions = recoveryRegions(residuals, result, raster.width, raster.height);
    if (regions.length > 15) throw new PdfReconstructionError("unsupportedInput");
    for (const region of regions) {
        if (result.lines.some(line => intersects(region, line.bounds) && !contains(region, line.bounds)))
            throw new PdfReconstructionError("unsupportedInput");
        const bounds = toPoints(region), crop = await options.rasterize(bounds);
        try {
            const recovered = await options.recognize(crop, bounds);
            ocrTextSamples(recovered, bounds.width, bounds.height);
            if (!recovered.lines.some(line => line.text.trim())) throw new PdfReconstructionError("unsupportedInput");
            const lines = recovered.lines.map(line => ({ ...line, bounds: {
                x: region.x + line.bounds.x * region.width / recovered.width,
                y: region.y + line.bounds.y * region.height / recovered.height,
                width: line.bounds.width * region.width / recovered.width,
                height: line.bounds.height * region.height / recovered.height,
            } }));
            result = { ...result, warnings: [...new Set([...result.warnings, ...recovered.warnings])],
                lines: [...result.lines.filter(line => !contains(region, line.bounds)), ...lines] };
        } finally {
            crop.bytes.fill(0);
            crop.pixels?.fill(0);
        }
    }
    if (scanResidualRegions(raster, result, coverage).length) throw new PdfReconstructionError("unsupportedInput");
    return { result, figures };
}

function recoveryRegions(residuals: PdfBounds[], result: OcrPageResult, width: number, height: number): PdfBounds[] {
    const textHeight = result.lines.map(line => line.bounds.height).sort((a, b) => a - b)[Math.floor(result.lines.length / 2)] ?? 12;
    const regions: PdfBounds[] = [];
    for (const residual of residuals) {
        let x = Math.max(0, residual.x - textHeight * 3), y = Math.max(0, residual.y - textHeight * .4);
        let right = Math.min(width, residual.x + residual.width + textHeight * 3), bottom = Math.min(height, residual.y + residual.height + textHeight * .4);
        // Include the neighboring OCR run so isolated field-label characters have context.
        for (const line of result.lines) {
            const box = line.bounds;
            if (intersects({ x, y, width: right - x, height: bottom - y }, box)) {
                x = Math.max(0, Math.min(x, box.x - textHeight * .4)); y = Math.max(0, Math.min(y, box.y - textHeight * .4));
                right = Math.min(width, Math.max(right, box.x + box.width + textHeight * .4)); bottom = Math.min(height, Math.max(bottom, box.y + box.height + textHeight * .4));
            }
        }
        const region = { x, y, width: right - x, height: bottom - y };
        for (let existing = regions.find(box => intersects(box, region)); existing; existing = regions.find(box => intersects(box, region))) {
            const left = Math.min(existing.x, region.x), top = Math.min(existing.y, region.y);
            region.width = Math.max(existing.x + existing.width, region.x + region.width) - left;
            region.height = Math.max(existing.y + existing.height, region.y + region.height) - top;
            region.x = left; region.y = top;
            regions.splice(regions.indexOf(existing), 1);
        }
        regions.push(region);
    }
    return regions;
}

function photographicRegion(raster: RasterPage, bounds: PdfBounds): boolean {
    if (!raster.pixels || bounds.width < 40 || bounds.height < 40) return false;
    const colors = new Set<number>();
    let sampled = 0, chromatic = 0, midtones = 0;
    const step = Math.max(1, Math.floor(Math.min(bounds.width, bounds.height) / 80));
    for (let y = Math.ceil(bounds.y); y < Math.min(raster.height, bounds.y + bounds.height); y += step)
        for (let x = Math.ceil(bounds.x); x < Math.min(raster.width, bounds.x + bounds.width); x += step) {
            const index = (y * raster.width + x) * 4, r = raster.pixels[index], g = raster.pixels[index + 1], b = raster.pixels[index + 2];
            sampled++;
            if (Math.max(r, g, b) - Math.min(r, g, b) > 24) chromatic++;
            if (Math.min(r, g, b) > 20 && Math.max(r, g, b) < 235) midtones++;
            colors.add((r >> 4) * 256 + (g >> 4) * 16 + (b >> 4));
        }
    return colors.size >= 128 && chromatic > sampled * .2 && midtones > sampled * .45;
}
