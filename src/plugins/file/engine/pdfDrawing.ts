import { OPS } from "pdfjs-dist";
import { PdfReconstructionError } from "./pdfComplexity.js";
import { multiplyTransform, transformBounds, transformPoint, type PdfBounds } from "./pdfGeometry.js";
import type { PdfGridLine } from "./pdfStructure.js";
export interface PdfImagePlacement {
    id: string;
    operation: number;
    args: unknown[];
    bounds: PdfBounds;
}
export interface PdfDrawing {
    lines: PdfGridLine[];
    vectors: PdfBounds[];
    fills: PdfBounds[];
    images: PdfImagePlacement[];
    invisibleText: string[];
}
const bad = (): never => { throw new PdfReconstructionError("unsupportedInput"); };
const numeric = (value: unknown): number[] => {
    if (!(Array.isArray(value) || value instanceof Float32Array || value instanceof Float64Array))
        return bad();
    const numbers = Array.from(value as ArrayLike<unknown>);
    if (!numbers.every((n): n is number => typeof n === "number" && Number.isFinite(n)))
        return bad();
    return numbers;
};
/** Decode the pinned PDF.js 6 DrawOPS format in the viewport's upright point space. */
export function extractPdfDrawing(fnArray: number[], argsArray: unknown[], viewportTransform: readonly number[], scannedPage = false): PdfDrawing {
    if (fnArray.length > 200000 || argsArray.length !== fnArray.length)
        bad();
    let matrix = [1, 0, 0, 1, 0, 0];
    const stack: Array<{ matrix: number[]; textRenderingMode: number; clip?: PdfBounds }> = [];
    let textRenderingMode = 0;
    let clip: PdfBounds | undefined;
    let pendingClip = false;
    const output: PdfDrawing = { lines: [], vectors: [], fills: [], images: [], invisibleText: [] };
    for (let index = 0; index < fnArray.length; index++) {
        const op = fnArray[index], raw = argsArray[index], args = Array.isArray(raw) ? raw : [];
        if (op === OPS.clip || op === OPS.eoClip) {
            if (!scannedPage || pendingClip) bad();
            pendingClip = true;
            continue;
        }
        if (pendingClip) {
            if (op !== OPS.constructPath || args[0] !== OPS.endPath) bad();
            const bounds = rectangularClip(args, multiplyTransform(viewportTransform, matrix));
            clip = clip ? intersectBounds(clip, bounds) : bounds;
            pendingClip = false;
            continue;
        }
        if ([OPS.shadingFill, OPS.paintSolidColorImageMask,
            OPS.paintInlineImageXObjectGroup, OPS.beginAnnotation, OPS.beginGroup,
            OPS.setStrokeTransparent, OPS.setFillTransparent, OPS.rawFillPath].includes(op)) {
            // These operators can alter visible coverage independently of extracted text.
            bad();
        }
        if (op === OPS.setTextRenderingMode) {
            textRenderingMode = Number(args[0]);
            if (!Number.isInteger(textRenderingMode) || textRenderingMode < 0 || textRenderingMode > 3)
                bad();
        }
        if (op === OPS.showText && textRenderingMode === 3) {
            if (!Array.isArray(args[0])) bad();
            const value = (args[0] as unknown[]).flatMap(glyph => {
                if (typeof glyph === "number") return [];
                if (!glyph || typeof glyph !== "object" || !("unicode" in glyph) || typeof glyph.unicode !== "string") return bad();
                return [glyph.unicode];
            }).join("").normalize("NFC").replace(/\s/gu, "");
            if (value) output.invisibleText.push(value);
        }
        if (op === OPS.setGState) {
            if (!Array.isArray(args[0])) bad();
            for (const setting of args[0] as unknown[]) {
                if (Array.isArray(setting)) {
                    if ((["ca", "CA"].includes(String(setting[0])) && setting[1] !== 1) || setting[0] === "SMask") bad();
                } else bad();
            }
        }
        if (op === OPS.save || op === OPS.paintFormXObjectBegin) {
            if (op === OPS.paintFormXObjectBegin && args[1]) bad();
            stack.push({ matrix: [...matrix], textRenderingMode, clip });
            if (stack.length > 128)
                bad();
            if (op === OPS.paintFormXObjectBegin && args[0])
                matrix = multiplyTransform(matrix, numeric(args[0]));
        }
        else if (op === OPS.restore || op === OPS.paintFormXObjectEnd) {
            const restored = stack.pop() ?? bad();
            matrix = restored.matrix;
            textRenderingMode = restored.textRenderingMode;
            clip = restored.clip;
        }
        else if (op === OPS.transform)
            matrix = multiplyTransform(matrix, numeric(args));
        else if (op === OPS.constructPath) {
            if (args[2] === null)
                continue;
            const m = multiplyTransform(viewportTransform, matrix), minMax = numeric(args[2]);
            if (minMax.length !== 4)
                bad();
            const box = transformBounds(m, { x: minMax[0], y: minMax[1], width: minMax[2] - minMax[0], height: minMax[3] - minMax[1] });
            if (args[0] === OPS.endPath)
                continue;
            const wrapper = args[1];
            if (!Array.isArray(wrapper))
                bad();
            const data = numeric(wrapper[0]);
            let start: [
                number,
                number
            ] | undefined, current: [
                number,
                number
            ] | undefined, rectilinear = true;
            const edges: PdfGridLine[] = [];
            const edge = (target: [
                number,
                number
            ]) => {
                if (!current)
                    return bad();
                const [x1, y1] = transformPoint(m, ...current), [x2, y2] = transformPoint(m, ...target);
                if (Math.abs(x1 - x2) > 1 && Math.abs(y1 - y2) > 1)
                    rectilinear = false;
                if (Math.hypot(x2 - x1, y2 - y1) > 1)
                    edges.push({ x1, y1, x2, y2 });
                current = target;
            };
            for (let i = 0; i < data.length;) {
                const instruction = data[i++];
                if (instruction === 0) {
                    current = [data[i++], data[i++]];
                    start = current;
                }
                else if (instruction === 1)
                    edge([data[i++], data[i++]]);
                else if (instruction === 4) {
                    if (start)
                        edge(start);
                }
                else if (instruction === 2 || instruction === 3) {
                    rectilinear = false;
                    const count = instruction === 2 ? 6 : 4;
                    current = [data[i + count - 2], data[i + count - 1]];
                    i += count;
                }
                else
                    bad();
            }
            if (rectilinear && [OPS.stroke, OPS.closeStroke].includes(args[0] as number))
                output.lines.push(...edges);
            else if (rectilinear && (box.width <= 2 || box.height <= 2))
                output.lines.push({ x1: box.x, y1: box.y, x2: box.x + box.width, y2: box.y + box.height });
            else if (box.width > 0 && box.height > 0) {
                if (rectilinear && edges.length === 4 && edges.every(edge =>
                    (Math.abs(edge.x1-box.x)<1 || Math.abs(edge.x1-box.x-box.width)<1) &&
                    (Math.abs(edge.y1-box.y)<1 || Math.abs(edge.y1-box.y-box.height)<1)))
                    output.fills.push(box);
                else output.vectors.push(box);
            }
        }
        else if ([OPS.paintImageXObject, OPS.paintInlineImageXObject].includes(op)) {
            const placement = transformBounds(multiplyTransform(viewportTransform, matrix), { x: 0, y: 0, width: 1, height: 1 });
            const bounds = clip ? intersectBounds(placement, clip) : placement;
            if (bounds.width > 0 && bounds.height > 0)
                output.images.push({ id: `image-${output.images.length}`, operation: op, args, bounds });
        }
        else if ([OPS.paintImageXObjectRepeat, OPS.paintImageMaskXObject, OPS.paintImageMaskXObjectRepeat, OPS.paintImageMaskXObjectGroup].includes(op))
            bad();
        if (output.lines.length > 2048 || output.images.length > 256 || output.vectors.length + output.fills.length > 2048)
            bad();
    }
    if (stack.length || pendingClip)
        bad();
    return output;
}

function intersectBounds(a: PdfBounds, b: PdfBounds): PdfBounds {
    const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
    return { x, y, width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x), height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y) };
}

function rectangularClip(args: unknown[], matrix: readonly number[]): PdfBounds {
    const wrapper = args[1];
    if (!Array.isArray(wrapper)) return bad();
    const data = numeric(wrapper[0]);
    if (data.length !== 13 || data[0] !== 0 || data[3] !== 1 || data[6] !== 1 || data[9] !== 1 || data[12] !== 4) bad();
    const points = [1, 4, 7, 10].map(index => transformPoint(matrix, data[index], data[index + 1]));
    for (let i = 0; i < 4; i++) {
        const a = points[i], b = points[(i + 1) % 4];
        if (Math.abs(a[0] - b[0]) > .01 && Math.abs(a[1] - b[1]) > .01) bad();
    }
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}
