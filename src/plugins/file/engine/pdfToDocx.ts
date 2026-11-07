import { GlobalWorkerOptions, OPS, PasswordResponses, getDocument, type PDFPageProxy } from "pdfjs-dist";
import { rasterizeOcrPage, ocrTextSamples, scanResidualRegions, type FileOcrRegion, type RasterPage } from "./pdfOcr.js";
import type { OcrPageResult } from "../../../core/ocr/contracts.js";
import type { FileConversionQualityIssue } from "../contracts.js";
import { aggregateQualityIssues, normalizeFontFamily, qualityIssue, QualityReportError } from "./qualityReport.js";
import { PdfReconstructionError, type PdfTextSample } from "./pdfComplexity.js";
import type { PdfDocxPage, PdfEditableImage } from "./editableDocx.js";
import { assertNotCancelled } from "./engineCancellation.js";
import { contains, intersects, multiplyTransform, type PdfBounds } from "./pdfGeometry.js";
import { extractPdfDrawing } from "./pdfDrawing.js";
import { reconstructStructuredPage, type PdfFigureRegion, type PdfTableBlock } from "./pdfStructure.js";
import { recognizeCompositeScan } from "./pdfScan.js";
import { reconstructScanPage, styleScanText } from "./pdfScanLayout.js";
export { FileEngineCancelledError } from "./engineCancellation.js";
export interface PdfToDocxProgress {
    stage: "parsing" | "analyzing" | "rendering" | "recognizing" | "packaging";
    percent?: number;
}
export interface PdfToDocxResult {
    bytes: Uint8Array;
    qualityProfile: "editableReconstruction";
    warningKeys: string[];
    pageCount: number;
    qualityIssues: FileConversionQualityIssue[];
}
export interface PdfToDocxOptions {
    assetBaseUrl?: string;
    deadlineMs?: number;
    writeDocx?: typeof import("./editableDocx.js").writeEditableDocx;
    recognizePage?: (page: RasterPage, pageNumber: number, region?: FileOcrRegion) => Promise<OcrPageResult>;
    rasterizePage?: typeof rasterizeOcrPage;
    inspectFonts?: (families: string[]) => Promise<FileConversionQualityIssue[]>;
}
const bad = (): never => { throw new PdfReconstructionError("unsupportedInput"); };
const boxOf = (text: PdfTextSample): PdfBounds => ({ x: text.x, y: text.y - text.height, width: text.width, height: text.height });
const releaseRaster = (raster: RasterPage) => { raster.bytes.fill(0); raster.pixels?.fill(0); };
export async function convertPdfToDocx(bytes: Uint8Array, signal: AbortSignal, onProgress: (progress: PdfToDocxProgress) => Promise<void>, options: PdfToDocxOptions = {}): Promise<PdfToDocxResult> {
    const deadline = options.deadlineMs ?? Date.now() + 120000;
    const check = () => { assertNotCancelled(signal); if (Date.now() >= deadline)
        throw new Error("timeout"); };
    check();
    const base = options.assetBaseUrl ?? new URL("./file-engine/", document.baseURI).toString();
    GlobalWorkerOptions.workerSrc = new URL("pdf.worker.min.mjs", base).toString();
    const loadingTask = getDocument({ data: bytes, cMapUrl: new URL("cmaps/", base).toString(), cMapPacked: true,
        standardFontDataUrl: new URL("standard_fonts/", base).toString(), wasmUrl: new URL("wasm/", base).toString(), useWasm: true });
    let passwordRequired = false;
    loadingTask.onPassword = (_updatePassword: (password: string) => void, reason: number) => { passwordRequired = reason === PasswordResponses.NEED_PASSWORD || reason === PasswordResponses.INCORRECT_PASSWORD; void loadingTask.destroy(); };
    const abort = () => { void loadingTask.destroy(); };
    signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, Math.max(1, deadline - Date.now()));
    const pages: PdfDocxPage[] = [];
    const issues: FileConversionQualityIssue[] = [];
    let imageBytes = 0, totalCharacters = 0;
    const families = new Set<string>();
    let fontInspectionComplete = true;
    try {
        await onProgress({ stage: "parsing", percent: 2 });
        const pdf = await loadingTask.promise;
        check();
        if (pdf.numPages > 512)
            bad();
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
            check();
            const page = await pdf.getPage(pageNumber);
            const images: PdfEditableImage[] = [];
            try {
                const content = await page.getTextContent();
                check();
                const visible = content.items.filter(item => "str" in item && item.str.trim());
                // Metadata rotation and text rotation are separate: normalize a coherent right-angle text baseline.
                const angles = visible.flatMap(item => "str" in item ? [Math.atan2(item.transform[1], item.transform[0]) * 180 / Math.PI] : []);
                const dominant = angles.length ? angles.slice().sort((a, b) => a - b)[Math.floor(angles.length / 2)] : page.rotate;
                const rotation = ((Math.round(dominant / 90) * 90) % 360 + 360) % 360;
                if (angles.some(angle => Math.abs((((angle - rotation + 180) % 360) + 360) % 360 - 180) > 2))
                    bad();
                const viewport = page.getViewport({ scale: 1, rotation });
                const operators = await page.getOperatorList();
                check();
                const fontNames = new Map<string, string | undefined>();
                let text = content.items.flatMap<PdfTextSample>(item => {
                    if (!("str" in item) || !item.str.trim())
                        return [];
                    const transform = multiplyTransform(viewport.transform, item.transform), [a, b, c, d, x, y] = transform;
                    if (!fontNames.has(item.fontName)) {
                        let family: string | undefined;
                        try {
                            const font: unknown = page.commonObjs.get(item.fontName);
                            if (font && typeof font === "object" && "name" in font && typeof font.name === "string")
                                family = normalizeFontFamily(font.name);
                        } catch { fontInspectionComplete = false; }
                        if (family && families.size < 256) families.add(family);
                        else fontInspectionComplete = false;
                        fontNames.set(item.fontName, family);
                    }
                    const family = fontNames.get(item.fontName) ?? content.styles[item.fontName]?.fontFamily;
                    return [{ text: item.str, x, y, width: Math.abs(item.width), height: Math.max(Math.hypot(c, d), Math.abs(item.height), 1), rotationDegrees: Math.atan2(b, a) * 180 / Math.PI, fontFamily: family, bold: /bold/i.test(family ?? ""), italic: /italic|oblique/i.test(family ?? "") }];
                });
                if (text.some(item => !contains({ x: 0, y: 0, width: viewport.width, height: viewport.height }, boxOf(item))))
                    bad();
                const compositeScan = text.length === 0 && (operators.fnArray.filter(op => op === OPS.paintImageXObject || op === OPS.paintInlineImageXObject).length > 1 || operators.fnArray.some(op => op === OPS.clip || op === OPS.eoClip));
                const drawing = extractPdfDrawing(operators.fnArray, operators.argsArray, viewport.transform, compositeScan);
                for (const hidden of drawing.invisibleText) {
                    const matches = text.filter(item => item.text.normalize("NFC").replace(/\s/gu, "").includes(hidden));
                    if (matches.length !== 1 || !drawing.images.some(image => contains(image.bounds, boxOf(matches[0]))))
                        bad();
                }
                const figures: PdfFigureRegion[] = [];
                const warnings: string[] = [];
                let regionId = 0;
                const rasterize = async (bounds?: PdfBounds): Promise<RasterPage> => {
                    if (!options.rasterizePage && typeof document === "undefined")
                        throw new PdfReconstructionError("ocrRequired");
                    // The chosen upright viewport must also be used by image and OCR rendering.
                    const uprightPage = { pageNumber: page.pageNumber, getViewport: ({ scale }: {
                            scale: number;
                        }) => page.getViewport({ scale, rotation }), render: page.render.bind(page) } as PDFPageProxy;
                    const raster = await (options.rasterizePage ?? rasterizeOcrPage)(uprightPage, signal, bounds);
                    try {
                        check();
                        return raster;
                    } catch (error) {
                        releaseRaster(raster);
                        throw error;
                    }
                };
                const picture = async (id: string, bounds: PdfBounds, nonEditable: boolean, sourceIds?: string[]) => {
                    if (bounds.width * bounds.height > viewport.width * viewport.height * .65)
                        bad();
                    const raster = await rasterize(bounds);
                    try {
                        imageBytes += raster.bytes.byteLength;
                        if (imageBytes > 64 * 1024 * 1024)
                            bad();
                        images.push({ id, data: raster.bytes.slice(), width: raster.width, height: raster.height });
                        figures.push({ id, bounds, nonEditable, sourceIds });
                    }
                    finally {
                        releaseRaster(raster);
                    }
                };
                const recognize = async (bounds: PdfBounds, existing: PdfTextSample[]) => {
                    const raster = await rasterize(bounds);
                    try {
                        if (raster.blank)
                            return;
                        let result: OcrPageResult | undefined;
                        const overlay = existing.filter(t => contains(bounds, boxOf(t)));
                        if (overlay.length) {
                            result = { width: raster.width, height: raster.height, warnings: [], lines: overlay.map(t => ({ text: t.text, confidence: 1, bounds: { x: (t.x - bounds.x) * raster.width / bounds.width, y: (t.y - t.height - bounds.y) * raster.height / bounds.height, width: t.width * raster.width / bounds.width, height: t.height * raster.height / bounds.height } })) };
                            try {
                                if (scanResidualRegions(raster, result).length > 0)
                                    result = undefined;
                            }
                            catch {
                                result = undefined;
                            }
                        }
                        const needsOcr = !result;
                        if (!result) {
                            if (!options.recognizePage)
                                throw new PdfReconstructionError("ocrRequired");
                            if (++regionId > 16)
                                bad();
                            await onProgress({ stage: "recognizing", percent: Math.round(pageNumber / pdf.numPages * 80) });
                            result = await options.recognizePage(raster, pageNumber, { id: regionId, bounds, pageWidth: viewport.width, pageHeight: viewport.height });
                            check();
                            if (!result.lines.some(line => line.text.trim()))
                                bad();
                        }
                        const samples = ocrTextSamples(result, bounds.width, bounds.height).map(t => ({ ...t, x: t.x + bounds.x, y: t.y + t.height + bounds.y }));
                        const residual = scanResidualRegions(raster, result);
                        // A residual image component may be an unrecognized shaded table or text.
                        // Only independently bounded PDF figures can currently be retained reliably.
                        if (residual.length > 0)
                            bad();
                        for (const sample of samples) {
                            const covered = overlay.find(t => intersects(boxOf(t), boxOf(sample), Math.min(t.height, sample.height) * .2));
                            if (covered) {
                                if (covered.text.normalize("NFC").replace(/\s/gu, "") !== sample.text.normalize("NFC").replace(/\s/gu, "")) {
                                    // A reliable layer may split a line into runs. Full run coverage is checked below.
                                    const runs = overlay.filter(t => intersects(boxOf(t), boxOf(sample))).sort((a, b) => a.x - b.x);
                                    if (runs.map(t => t.text).join("").replace(/\s/gu, "") !== sample.text.replace(/\s/gu, ""))
                                        bad();
                                }
                            }
                            else
                                text.push(sample);
                        }
                        if (needsOcr) {
                            warnings.push("file.quality.ocrUsed");
                            issues.push(qualityIssue("ocrUsed", { pageNumbers: [pageNumber] }));
                            if (result.warnings.includes("lowConfidence")) {
                                warnings.push("file.quality.ocrLowConfidence");
                                issues.push(qualityIssue("ocrLowConfidence", { pageNumbers: [pageNumber] }));
                            }
                            if (raster.downsampled) {
                                warnings.push("file.quality.ocrDownsampled");
                                issues.push(qualityIssue("ocrDownsampled", { pageNumbers: [pageNumber] }));
                            }
                        }
                    }
                    finally {
                        releaseRaster(raster);
                    }
                };
                if (text.length === 0 && drawing.images.length === 0 && (drawing.lines.length || drawing.vectors.length || drawing.fills.length)) {
                    // Vector-only pages cannot acquire fabricated editable body through an image fallback.
                    bad();
                }
                if (compositeScan) {
                    const raster = await rasterize();
                    try {
                        if (!raster.blank) {
                            if (!options.recognizePage) throw new PdfReconstructionError("ocrRequired");
                            const scanned = await recognizeCompositeScan({ raster, width: viewport.width, height: viewport.height, images: drawing.images, rasterize,
                                recognize: async (input, bounds) => {
                                    check();
                                    if (++regionId > 16) bad();
                                    await onProgress({ stage: "recognizing", percent: Math.round(pageNumber / pdf.numPages * 80) });
                                    const result = await options.recognizePage!(input, pageNumber, { id: regionId, bounds, pageWidth: viewport.width, pageHeight: viewport.height });
                                    check();
                                    return result;
                                } });
                            text = ocrTextSamples(scanned.result, viewport.width, viewport.height).map(item => ({ ...item, y: item.y + item.height }));
                            text = styleScanText(text, raster, viewport.width, viewport.height);
                            families.add("Arial");
                            fontInspectionComplete = false;
                            for (const figure of scanned.figures) await picture(figure.id, figure.bounds, false);
                            warnings.push("file.quality.ocrUsed", "file.quality.structureSimplified");
                            issues.push(qualityIssue("ocrUsed", { pageNumbers: [pageNumber] }));
                            if (scanned.result.warnings.includes("lowConfidence")) {
                                warnings.push("file.quality.ocrLowConfidence");
                                issues.push(qualityIssue("ocrLowConfidence", { pageNumbers: [pageNumber] }));
                            }
                            if (raster.downsampled) {
                                warnings.push("file.quality.ocrDownsampled");
                                issues.push(qualityIssue("ocrDownsampled", { pageNumbers: [pageNumber] }));
                            }
                        }
                    } finally { releaseRaster(raster); }
                }
                for (const image of compositeScan ? [] : drawing.images) {
                    const bounds = image.bounds, area = bounds.width * bounds.height / (viewport.width * viewport.height);
                    const overlapping = text.some(t => intersects(bounds, boxOf(t)));
                    if (area >= .6 || (bounds.width >= viewport.width * .65 && bounds.height >= viewport.height * .2) || overlapping) {
                        await recognize(bounds, text.slice());
                    }
                    else if (text.length === 0) {
                        await recognize(bounds, []);
                    }
                    else
                        await picture(image.id, bounds, false);
                }
                let model = (compositeScan ? reconstructScanPage : reconstructStructuredPage)({ width: viewport.width, height: viewport.height, text, lines: compositeScan ? [] : drawing.lines, figures });
                const tables = model.blocks.filter((b): b is PdfTableBlock => b.kind === "table");
                const tableBounds = tables.map(b => b.bounds);
                const unusedLines = drawing.lines.filter(l => !tableBounds.some(b => contains(b, { x: Math.min(l.x1, l.x2), y: Math.min(l.y1, l.y2), width: Math.abs(l.x2 - l.x1), height: Math.abs(l.y2 - l.y1) })));
                const graphics = compositeScan ? [] : [...drawing.vectors, ...drawing.fills.filter(fill => !tables.some(table => tableBackground(fill, table))), ...unusedLines.map(l => ({ x: Math.min(l.x1, l.x2), y: Math.min(l.y1, l.y2), width: Math.abs(l.x2 - l.x1), height: Math.abs(l.y2 - l.y1) }))];
                for (const [index, graphicBounds] of groupGraphics(graphics, viewport.width, viewport.height).entries()) {
                    const bounds = includeGraphicLabels(graphicBounds, text, viewport.width, viewport.height);
                    if (tableBounds.some(b => intersects(b, bounds)))
                        bad();
                    const labels = text.map((t, index) => ({ t, id: `text-${index}` })).filter(({ t }) => intersects(bounds, boxOf(t)));
                    if (labels.some(({ t }) => !contains(bounds, boxOf(t))))
                        bad();
                    await picture(`vector-${index}`, bounds, true, labels.map(s => s.id));
                }
                if (graphics.length)
                    model = reconstructStructuredPage({ width: viewport.width, height: viewport.height, text, lines: drawing.lines, figures });
                totalCharacters += text.reduce((sum, t) => sum + t.text.length, 0);
                if (totalCharacters > 5000000)
                    bad();
                model.warningKeys.push(...warnings);
                for (const figure of figures.filter(f => f.nonEditable)) {
                    void figure;
                    issues.push(qualityIssue("nonEditableGraphic", { pageNumbers: [pageNumber] }));
                }
                if (model.tableSimplified)
                    issues.push(qualityIssue("tableSimplified", { pageNumbers: [pageNumber] }));
                if (model.warningKeys.includes("file.quality.structureSimplified"))
                    issues.push(qualityIssue("layoutReflowed", { pageNumbers: [pageNumber] }));
                pages.push({ ...model, images });
            }
            catch (error) {
                images.forEach(image => image.data.fill(0));
                throw error;
            }
            finally {
                page.cleanup();
            }
            await onProgress({ stage: "analyzing", percent: Math.round(pageNumber / pdf.numPages * 85) });
        }
        if (!pages.some(page => page.paragraphs.length > 0 || page.blocks?.some(block => block.kind === "table" && block.cells.some(cell => cell.paragraphs.length > 0))))
            bad();
        check();
        if (options.inspectFonts)
            issues.push(...await options.inspectFonts([...families]));
        if (!options.inspectFonts || !fontInspectionComplete)
            issues.push(qualityIssue("fontInspectionIncomplete", {}));
        check();
        await onProgress({ stage: "packaging", percent: 90 });
        const writeDocx = options.writeDocx ?? (await import("./editableDocx.js")).writeEditableDocx;
        check();
        const output = await writeDocx(pages, signal);
        check();
        return { bytes: output, qualityProfile: "editableReconstruction", pageCount: pdf.numPages, qualityIssues: aggregateQualityIssues(issues),
            warningKeys: [...new Set(["file.quality.editableReconstructionWarning", ...pages.flatMap(page => page.warningKeys)])] };
    }
    catch (error) {
        check();
            const code = passwordRequired ? "passwordRequired" : error instanceof Error && error.name === "InvalidPDFException" ? "invalidInput" : error instanceof Error ? error.message : "providerFailed";
        const report = new QualityReportError(code, aggregateQualityIssues(issues));
        if (error instanceof PdfReconstructionError)
            Object.assign(report, { code: error.code });
        throw report;
    }
    finally {
        clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
        pages.forEach(page => page.images.forEach(image => image.data.fill(0)));
        await loadingTask.destroy();
    }
}

function tableBackground(fill: PdfBounds, table: PdfTableBlock): boolean {
    if (!contains(table.bounds, fill)) return false;
    const edges = (start: number, sizes: number[]) => sizes.reduce<number[]>((values, size) => [...values, values[values.length-1]+size], [start]);
    const xs = edges(table.bounds.x, table.columnWidths), ys = edges(table.bounds.y, table.rowHeights);
    const aligned = (value: number, candidates: number[]) => candidates.some(edge => Math.abs(edge-value)<2);
    return aligned(fill.x,xs) && aligned(fill.x+fill.width,xs) && aligned(fill.y,ys) && aligned(fill.y+fill.height,ys);
}
function groupGraphics(input: PdfBounds[], pageWidth: number, pageHeight: number): PdfBounds[] {
    const groups: PdfBounds[] = [];
    for (const original of input) {
        const b = { x: Math.max(0, original.x - 4), y: Math.max(0, original.y - 4), width: original.width + 8, height: original.height + 8 };
        for (let hit = groups.find(g => intersects({ ...g, x: g.x - 40, y: g.y - 40, width: g.width + 80, height: g.height + 80 }, b)); hit; hit = groups.find(g => intersects({ ...g, x: g.x - 40, y: g.y - 40, width: g.width + 80, height: g.height + 80 }, b))) {
            const x = Math.min(b.x, hit.x), y = Math.min(b.y, hit.y);
            b.width = Math.max(b.x + b.width, hit.x + hit.width) - x;
            b.height = Math.max(b.y + b.height, hit.y + hit.height) - y;
            b.x = x;
            b.y = y;
            groups.splice(groups.indexOf(hit), 1);
        }
        b.width = Math.min(b.width, pageWidth - b.x);
        b.height = Math.min(b.height, pageHeight - b.y);
        groups.push(b);
        if (groups.length > 128)
            bad();
    }
    return groups;
}
function includeGraphicLabels(graphic: PdfBounds, text: PdfTextSample[], pageWidth: number, pageHeight: number): PdfBounds {
    const bounds = { ...graphic };
    const near = { x: graphic.x - 20, y: graphic.y - 20, width: graphic.width + 40, height: graphic.height + 40 };
    for (const item of text.filter(t => intersects(near, boxOf(t)))) {
        const box = boxOf(item);
        // Short local labels are supported; a paragraph crossing a graphic is ambiguous.
        if (item.text.length > 24 || box.width > graphic.width * .6)
            bad();
        const padding = Math.max(4, item.height * .35);
        const x = Math.max(0, Math.min(bounds.x, box.x - padding)), y = Math.max(0, Math.min(bounds.y, box.y - padding));
        bounds.width = Math.min(pageWidth, Math.max(bounds.x + bounds.width, box.x + box.width + padding)) - x;
        bounds.height = Math.min(pageHeight, Math.max(bounds.y + bounds.height, box.y + box.height + padding)) - y;
        bounds.x = x;
        bounds.y = y;
    }
    return bounds;
}
