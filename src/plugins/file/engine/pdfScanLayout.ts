import type { PdfTextSample } from "./pdfComplexity.js";
import type { PdfBounds } from "./pdfGeometry.js";
import type { RasterPage } from "./pdfOcr.js";
import { reconstructStructuredPage, type PdfContentBlock, type PdfFigureBlock, type PdfParagraphBlock, type PdfStructureInput, type PdfStructuredPage } from "./pdfStructure.js";

type Leaf = PdfParagraphBlock | PdfFigureBlock;
const right = (box: PdfBounds) => box.x + box.width;
const bottom = (box: PdfBounds) => box.y + box.height;
const median = (values: number[], fallback: number) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? fallback;
const boundsOf = (boxes: PdfBounds[]): PdfBounds => {
    const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
    return { x, y, width: Math.max(...boxes.map(right)) - x, height: Math.max(...boxes.map(bottom)) - y };
};

/** OCR bounds include padding, not a font's em square. Long CJK lines provide a
 * useful advance estimate; short labels and latin words cannot establish one. */
export function styleScanText(text: PdfTextSample[], raster: RasterPage, width: number, height: number): PdfTextSample[] {
    const typicalHeight = median(text.map(t => t.height), 12);
    const estimates = text.filter(t => t.height < typicalHeight * 1.5).flatMap(t => {
        const chars = [...t.text], cjk = chars.filter(c => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(c)).length;
        if (cjk < 8 || cjk < chars.length * .6) return [];
        const ems = chars.reduce((sum, c) => sum + (/\s/u.test(c) ? .3 : /[\x21-\x7e]/u.test(c) ? .55 : 1), 0);
        const size = t.width / ems;
        return size >= t.height * .6 && size <= t.height * 1.1 ? [size] : [];
    });
    const bodySize = Math.max(6, median(estimates, typicalHeight * .82));
    return text.map(t => ({ ...t, fontFamily: "Arial", fontSize: t.height >= typicalHeight * 1.6 ? t.height * .95 : bodySize,
        ...scanColors(raster, { x: t.x * raster.width / width, y: (t.y - t.height) * raster.height / height,
            width: t.width * raster.width / width, height: t.height * raster.height / height }) }));
}

function scanColors(raster: RasterPage, box: PdfBounds): Pick<PdfTextSample, "color" | "background"> {
    if (!raster.pixels) return { color: "000000" };
    const bins = new Map<number, { count: number; r: number; g: number; b: number }>();
    const step = Math.max(1, Math.ceil(Math.sqrt(box.width * box.height / 6000)));
    let count = 0;
    for (let y = Math.max(0, Math.ceil(box.y)); y < Math.min(raster.height, bottom(box)); y += step)
        for (let x = Math.max(0, Math.ceil(box.x)); x < Math.min(raster.width, right(box)); x += step) {
            const i = (y * raster.width + x) * 4, r = raster.pixels[i], g = raster.pixels[i + 1], b = raster.pixels[i + 2];
            const key = (r >> 4) * 256 + (g >> 4) * 16 + (b >> 4);
            const bin = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
            bin.count++; bin.r += r; bin.g += g; bin.b += b; bins.set(key, bin); count++;
        }
    const colors = [...bins.values()].map(c => ({ count: c.count, rgb: [c.r / c.count, c.g / c.count, c.b / c.count] })).sort((a, b) => b.count - a.count);
    const hex = (rgb: number[]) => rgb.map(c => Math.round(c).toString(16).padStart(2, "0")).join("").toUpperCase();
    const chromatic = colors.find(c => Math.max(...c.rgb) - Math.min(...c.rgb) > 20 && Math.max(...c.rgb) < 230);
    if (!chromatic || chromatic.count < count * .01) return { color: "000000" };
    if (chromatic === colors[0] && chromatic.count > count * .3) {
        const luminance = (rgb: number[]) => rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
        const background = luminance(chromatic.rgb);
        const light = colors.reduce((n, c) => n + (luminance(c.rgb) > background + 55 ? c.count : 0), 0);
        const dark = colors.reduce((n, c) => n + (luminance(c.rgb) < background - 55 ? c.count : 0), 0);
        if (Math.max(light, dark) > count * .01)
            return { color: light > dark ? "FFFFFF" : "000000", background: hex(chromatic.rgb) };
    }
    return { color: hex(chromatic.rgb) };
}

/** Recover only measurable flow: local columns, line pitch and explicit colors.
 * The scan remains a recognition input, never a background behind editable text. */
export function reconstructScanPage(input: PdfStructureInput): PdfStructuredPage {
    const validated = reconstructStructuredPage(input);
    if (!input.text.length) return validated;
    const bodySize = median(input.text.map(t => t.fontSize ?? t.height), 12);
    const leaves: Leaf[] = input.text.filter(t => t.text.trim()).map((t, i) => ({ kind: "paragraph", sourceIds: [`text-${i}`],
        bounds: { x: t.x, y: t.y - t.height, width: t.width, height: t.height },
        paragraph: { runs: [t], heading: (t.fontSize ?? t.height) >= bodySize * 1.6 ? 1 : t.background ? 2 : undefined, fill: t.background } }));
    leaves.push(...validated.blocks.filter((b): b is PdfFigureBlock => b.kind === "figure"));
    const allBounds = boundsOf(leaves.map(b => b.bounds));
    const left = Math.max(18, allBounds.x - 4), pageRight = Math.max(18, input.width - right(allBounds) - 4);
    const usableWidth = input.width - left - pageRight;
    const heading = (leaf: Leaf) => leaf.kind === "paragraph" && leaf.paragraph.heading !== undefined;
    const headings = leaves.filter(heading).sort((a, b) => a.bounds.y - b.bounds.y);
    const body = leaves.filter(b => !heading(b));
    const blocks: PdfContentBlock[] = [];
    let start = -Infinity;
    for (const header of [...headings, undefined]) {
        const end = header?.bounds.y ?? Infinity;
        const section = body.filter(b => b.bounds.y >= start && b.bounds.y < end);
        blocks.push(...sectionBlocks(section, bodySize, left, usableWidth));
        if (header) {
            const paragraph = (header as PdfParagraphBlock).paragraph;
            paragraph.alignment = header.bounds.width < usableWidth * .8 && Math.abs(header.bounds.x + header.bounds.width / 2 - input.width / 2) < 20 ? "center" : "left";
            paragraph.indent = 0;
            if (paragraph.fill) paragraph.rightIndent = Math.max(0, usableWidth - header.bounds.width - bodySize * 3);
            paragraph.runs.forEach(run => { run.bold = true; });
            blocks.push(header);
        }
        start = end;
    }
    // Preserve positive source gaps, but let flow expand instead of overlapping
    // when a table/photo is taller than neighboring source decoration.
    let previousBottom = allBounds.y;
    for (const block of blocks) {
        if (block.kind === "paragraph") {
            const fontSize = Math.max(...block.paragraph.runs.map(r => r.fontSize ?? r.height));
            block.paragraph.spacing ??= { before: 0, after: 0, line: fontSize * 1.15 };
            block.paragraph.spacing.before = Math.max(0, Math.min(48, block.bounds.y - previousBottom));
        }
        const lineExtra = block.kind === "paragraph" ? Math.max(0, (block.paragraph.spacing?.line ?? 0) - (block.paragraph.runs[block.paragraph.runs.length - 1]?.height ?? 0)) : 0;
        previousBottom = Math.max(previousBottom, bottom(block.bounds) + lineExtra);
    }
    return { ...validated, blocks, paragraphs: blocks.flatMap(b => b.kind === "paragraph" ? [b.paragraph] : b.kind === "columns" ? b.columns.flatMap(c => c.blocks.flatMap(p => p.kind === "paragraph" ? [p.paragraph] : [])) : []),
        margin: { left, right: pageRight, top: Math.max(18, allBounds.y - 2), bottom: 24 } };
}

function sectionBlocks(leaves: Leaf[], size: number, left: number, width: number): PdfContentBlock[] {
    if (!leaves.length) return [];
    const bounds = boundsOf(leaves.map(b => b.bounds));
    // An unobstructed vertical gutter must persist over the entire local section.
    const groups: Leaf[][] = [];
    for (const leaf of [...leaves].sort((a, b) => a.bounds.x - b.bounds.x)) {
        const last = groups[groups.length - 1];
        if (last && leaf.bounds.x - Math.max(...last.map(b => right(b.bounds))) < size) last.push(leaf);
        else groups.push([leaf]);
    }
    for (let i = 0; i < groups.length && groups.length > 1; i++) {
        const group = groups[i], box = boundsOf(group.map(b => b.bounds));
        if (group.some(b => b.kind === "figure") || (box.width >= bounds.width * .18 && group.length >= 2)) continue;
        const neighbor = i === 0 ? 1 : i === groups.length - 1 ? i - 1
            : box.x - right(boundsOf(groups[i - 1].map(b => b.bounds))) < boundsOf(groups[i + 1].map(b => b.bounds)).x - right(box) ? i - 1 : i + 1;
        groups[neighbor].push(...group); groups.splice(i, 1); i = -1;
    }
    const columnBounds = groups.map(group => boundsOf(group.map(b => b.bounds)));
    const sharedHeight = Math.min(...columnBounds.map(bottom)) - Math.max(...columnBounds.map(b => b.y));
    if (groups.length < 2 || groups.length > 3 || sharedHeight < size) return flowParagraphs(leaves, size, left, width);
    const edges = [left, ...groups.slice(1).map(group => boundsOf(group.map(b => b.bounds)).x - size * .5), left + width];
    return [{ kind: "columns", bounds: { ...bounds, x: left, width }, sourceIds: leaves.flatMap(b => b.sourceIds),
        columns: groups.map((group, i) => ({ width: edges[i + 1] - edges[i], blocks: flowParagraphs(group, size, edges[i], edges[i + 1] - edges[i], false) })) }];
}

function flowParagraphs(leaves: Leaf[], size: number, left: number, width: number, mergeLines = true): Leaf[] {
    const sorted = [...leaves].sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
    const rows: Leaf[] = [];
    for (const leaf of sorted) {
        const last = rows[rows.length - 1];
        if (last?.kind === "paragraph" && leaf.kind === "paragraph" && Math.abs(bottom(last.bounds) - bottom(leaf.bounds)) < size * .6) {
            const ordered = [...last.paragraph.runs, ...leaf.paragraph.runs].sort((a, b) => a.x - b.x);
            last.paragraph.runs = joinRuns(ordered);
            last.bounds = boundsOf([last.bounds, leaf.bounds]); last.sourceIds.push(...leaf.sourceIds);
        } else rows.push({ ...leaf, bounds: { ...leaf.bounds } });
    }
    const output: Leaf[] = [];
    let previousRow: Leaf | undefined;
    for (const row of rows) {
        if (row.kind === "figure") { output.push(row); previousRow = row; continue; }
        const paragraph = row.paragraph;
        paragraph.indent = Math.max(0, row.bounds.x - left);
        paragraph.alignment = "left";
        paragraph.spacing = { before: 0, after: 0, line: size * 1.2 };
        const previous = output[output.length - 1];
        const gap = previousRow ? row.bounds.y - bottom(previousRow.bounds) : 0;
        const startsLabel = /^[^：:\s]{2,8}\s*[：:]/u.test(paragraph.runs.map(r => r.text).join(""));
        const continuous = mergeLines && !startsLabel && previousRow?.kind === "paragraph" && previous?.kind === "paragraph" &&
            gap >= -size * .3 && gap < size * .85 &&
            right(previousRow.bounds) > left + width * .82 && Math.abs(row.bounds.x - previousRow.bounds.x) < size * 2.5;
        if (continuous && previous.kind === "paragraph") {
            previous.paragraph.runs = joinRuns([...previous.paragraph.runs, ...paragraph.runs]);
            previous.paragraph.spacing!.line = Math.max(size * 1.15, Math.min(size * 1.8, row.bounds.y - previousRow!.bounds.y));
            previous.paragraph.firstLine = Math.max(0, previous.bounds.x - row.bounds.x);
            previous.paragraph.indent = Math.max(0, Math.min(previous.bounds.x, row.bounds.x) - left);
            previous.bounds = boundsOf([previous.bounds, row.bounds]); previous.sourceIds.push(...row.sourceIds);
        } else {
            paragraph.spacing.before = Math.max(0, Math.min(size, gap));
            output.push(row);
        }
        // Do not retain an alias to the paragraph bounds, which expand on merging.
        previousRow = { ...row, bounds: { ...row.bounds } };
    }
    return output;
}

function joinRuns(runs: PdfTextSample[]): PdfTextSample[] {
    return runs.flatMap((run, i) => {
        const previous = runs[i - 1];
        if (!previous || /\s$/u.test(previous.text) || /^\s/u.test(run.text)) return [run];
        const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}，。！？；：]$/u.test(previous.text) && /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}，。！？；：]/u.test(run.text);
        return cjk ? [run] : [{ ...run, text: " " }, run];
    });
}
