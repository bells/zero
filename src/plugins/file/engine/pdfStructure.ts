import { PdfReconstructionError, reconstructPdfPage, type PdfEditablePage, type PdfEditableParagraph, type PdfTextSample } from "./pdfComplexity.js";
import { contains, intersects, type PdfBounds } from "./pdfGeometry.js";
export interface PdfGridLine {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}
export interface PdfFigureRegion {
    id: string;
    bounds: PdfBounds;
    nonEditable: boolean;
    sourceIds?: string[];
}
export interface PdfContentDisposition {
    id: string;
    disposition: "editableText" | "tableCell" | "localGraphic";
}
export interface PdfTableCell {
    row: number;
    column: number;
    rowSpan: number;
    colSpan: number;
    paragraphs: PdfEditableParagraph[];
}
interface BlockBase {
    bounds: PdfBounds;
    sourceIds: string[];
}
export interface PdfParagraphBlock extends BlockBase {
    kind: "paragraph";
    paragraph: PdfEditableParagraph;
}
export interface PdfTableBlock extends BlockBase {
    kind: "table";
    rowCount: number;
    columnWidths: number[];
    rowHeights: number[];
    cells: PdfTableCell[];
}
export interface PdfFigureBlock extends BlockBase {
    kind: "figure";
    figureId: string;
    nonEditable: boolean;
}
export interface PdfColumnsBlock extends BlockBase {
    kind: "columns";
    columns: { width: number; blocks: (PdfParagraphBlock | PdfFigureBlock)[] }[];
}
export type PdfContentBlock = PdfParagraphBlock | PdfTableBlock | PdfFigureBlock | PdfColumnsBlock;
export interface PdfStructuredPage extends PdfEditablePage {
    blocks: PdfContentBlock[];
    dispositions: PdfContentDisposition[];
    tableSimplified: boolean;
}
export interface PdfStructureInput {
    width: number;
    height: number;
    text: PdfTextSample[];
    lines: PdfGridLine[];
    figures: PdfFigureRegion[];
}
const unsupported = (): never => { throw new PdfReconstructionError("unsupportedInput"); };
const textBounds = (text: PdfTextSample): PdfBounds => ({ x: text.x, y: text.y - text.height, width: text.width, height: text.height });
const unionBounds = (boxes: PdfBounds[]): PdfBounds => {
    const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
    return { x, y, width: Math.max(...boxes.map(b => b.x + b.width)) - x, height: Math.max(...boxes.map(b => b.y + b.height)) - y };
};
function borderlessRows(text: PdfTextSample[]): boolean {
    const rows: PdfTextSample[][] = [];
    for (const item of [...text].sort((a, b) => a.y - b.y || a.x - b.x)) {
        const last = rows[rows.length - 1];
        if (last && Math.abs(last[0].y - item.y) < 2) last.push(item);
        else rows.push([item]);
    }
    let alignedRows = 0;
    for (const row of rows) {
        row.sort((a, b) => a.x - b.x);
        let cells = 1;
        for (let i = 1; i < row.length; i++) {
            if (row[i].x - row[i - 1].x - row[i - 1].width > Math.max(8, row[i].height * 2)) cells++;
        }
        if (cells >= 3 && ++alignedRows >= 2) return true;
    }
    return false;
}
const paragraphInput = (input: PdfStructureInput, text: PdfTextSample[]) => ({ width: input.width, height: input.height, text, vectorOperationCount: 0, imageCount: 0, preferRows: borderlessRows(text) });
export function reconstructStructuredPage(input: PdfStructureInput): PdfStructuredPage {
    if (input.lines.length > 2048 || input.figures.length > 256 || input.text.length > 50000)
        unsupported();
    // Validate every source before it can be assigned to a table or raster region.
    const validated = reconstructPdfPage(paragraphInput(input, input.text));
    const sources = input.text.filter(t => t.text.trim()).map((item, index) => ({ item, id: `text-${index}` }));
    const dispositions = new Map<string, PdfContentDisposition>();
    const blocks: PdfContentBlock[] = [];
    const claim = (id: string, disposition: PdfContentDisposition["disposition"]) => {
        if (dispositions.has(id))
            unsupported();
        dispositions.set(id, { id, disposition });
    };
    for (const table of detectTables(input)) {
        const items = sources.filter(s => intersects(table.bounds, textBounds(s.item)));
        for (const source of items) {
            const box = textBounds(source.item);
            if (!contains(table.bounds, box))
                unsupported();
            const cell = table.cells.filter(c => contains(c.bounds, box));
            if (cell.length !== 1)
                unsupported();
            cell[0].text.push(source.item);
            claim(source.id, "tableCell");
            table.sourceIds.push(source.id);
        }
        if (!items.length)
            continue;
        blocks.push({ ...table, kind: "table", cells: table.cells.map(c => ({ row: c.row, column: c.column, rowSpan: c.rowSpan, colSpan: c.colSpan,
                paragraphs: reconstructPdfPage(paragraphInput(input, c.text)).paragraphs })) });
    }
    for (const figure of input.figures) {
        const bounds = figure.bounds;
        if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0 ||
            !contains({ x: 0, y: 0, width: input.width, height: input.height }, bounds) || bounds.width * bounds.height > input.width * input.height * .65 ||
            blocks.some(b => intersects(b.bounds, bounds)))
            unsupported();
        const assigned = sources.filter(s => intersects(bounds, textBounds(s.item)));
        // Only explicitly attributed labels may become part of a local picture.
        if (assigned.some(s => !figure.sourceIds?.includes(s.id) || !contains(bounds, textBounds(s.item))))
            unsupported();
        assigned.forEach(s => claim(s.id, "localGraphic"));
        blocks.push({ kind: "figure", bounds, sourceIds: assigned.map(s => s.id), figureId: figure.id, nonEditable: figure.nonEditable });
    }
    const remaining = sources.filter(s => !dispositions.has(s.id));
    const sourceByItem = new Map(remaining.map(source => [source.item, source]));
    const paragraphs = reconstructPdfPage(paragraphInput(input, remaining.map(s => s.item))).paragraphs;
    const heights = remaining.map(s => s.item.height).sort((a, b) => a - b);
    const bodyHeight = heights[Math.floor(heights.length / 2)] ?? 12;
    const leftEdge = Math.min(...remaining.map(s => s.item.x));
    for (const paragraph of paragraphs) {
        const members = paragraph.runs.flatMap(run => sourceByItem.get(run) ?? []);
        if (!members.length)
            unsupported();
        const bounds = unionBounds(members.map(s => textBounds(s.item)));
        const fontSize = Math.max(...members.map(s => s.item.height));
        if (fontSize >= bodyHeight * 1.12)
            paragraph.heading = fontSize >= bodyHeight * 1.4 ? 1 : 2;
        const center = bounds.x + bounds.width / 2;
        paragraph.alignment = Math.abs(center - input.width / 2) < 12 && bounds.width < input.width * .8 ? "center"
            : bounds.x > input.width * .45 ? "right" : "left";
        paragraph.indent = Math.max(0, bounds.x - leftEdge);
        const ids = members.map(s => s.id);
        ids.forEach(id => claim(id, "editableText"));
        blocks.push({ kind: "paragraph", paragraph, bounds, sourceIds: ids });
    }
    if (dispositions.size !== sources.length)
        unsupported();
    const tableSimplified = paragraphInput(input, remaining.map(s => s.item)).preferRows;
    const ordered = tableSimplified ? [...blocks].sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x) : readingOrder(blocks, input.width);
    const warningKeys = [...validated.warningKeys];
    if (input.figures.length)
        warningKeys.push("file.quality.imagesRetained");
    if (input.figures.some(f => f.nonEditable))
        warningKeys.push("file.quality.nonEditableGraphic");
    return { width: input.width, height: input.height, paragraphs: ordered.flatMap(b => b.kind === "paragraph" ? [b.paragraph] : []), blocks: ordered,
        dispositions: [...dispositions.values()], tableSimplified, warningKeys: [...new Set(warningKeys)] };
}
function readingOrder(blocks: PdfContentBlock[], width: number): PdfContentBlock[] {
    const sorted = [...blocks].sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
    const left = sorted.filter(b => b.bounds.x + b.bounds.width <= width * .5);
    const right = sorted.filter(b => b.bounds.x >= width * .5);
    if (left.length < 2 || right.length < 2)
        return sorted;
    const gutter = (Math.max(...left.map(b => b.bounds.x + b.bounds.width)) + Math.min(...right.map(b => b.bounds.x))) / 2;
    if (Math.min(...right.map(b => b.bounds.x)) - Math.max(...left.map(b => b.bounds.x + b.bounds.width)) < width * .04)
        return sorted;
    const output: PdfContentBlock[] = [];
    let pending: PdfContentBlock[] = [];
    const columnStart = Math.min(...right.map(b => b.bounds.y)), columnEnd = Math.max(...right.map(b => b.bounds.y + b.bounds.height));
    const flush = () => { output.push(...pending.filter(b => b.bounds.x + b.bounds.width <= gutter), ...pending.filter(b => b.bounds.x >= gutter)); pending = []; };
    for (const block of sorted) {
        if (block.bounds.y + block.bounds.height < columnStart || block.bounds.y > columnEnd ||
            (block.kind === "paragraph" && block.paragraph.heading) ||
            (block.bounds.x < gutter && block.bounds.x + block.bounds.width > gutter)) {
            flush();
            output.push(block);
        }
        else
            pending.push(block);
    }
    flush();
    return output;
}
interface GridCell extends PdfTableCell {
    bounds: PdfBounds;
    text: PdfTextSample[];
}
interface Grid {
    bounds: PdfBounds;
    sourceIds: string[];
    rowCount: number;
    columnWidths: number[];
    rowHeights: number[];
    cells: GridCell[];
}
function detectTables(input: PdfStructureInput): Grid[] {
    const lines = input.lines.filter(l => [l.x1, l.y1, l.x2, l.y2].every(Number.isFinite) &&
        (Math.abs(l.x1 - l.x2) < 1 || Math.abs(l.y1 - l.y2) < 1));
    const groups: PdfGridLine[][] = [];
    for (const line of lines) {
        const box = { x: Math.min(line.x1, line.x2) - 2, y: Math.min(line.y1, line.y2) - 2, width: Math.abs(line.x2 - line.x1) + 4, height: Math.abs(line.y2 - line.y1) + 4 };
        const hits = groups.filter(g => g.some(l => intersects(box, { x: Math.min(l.x1, l.x2) - 2, y: Math.min(l.y1, l.y2) - 2, width: Math.abs(l.x2 - l.x1) + 4, height: Math.abs(l.y2 - l.y1) + 4 })));
        if (!hits.length)
            groups.push([line]);
        else {
            const target = hits[0];
            target.push(line);
            for (const other of hits.slice(1)) {
                target.push(...other);
                groups.splice(groups.indexOf(other), 1);
            }
        }
    }
    const grids: Grid[] = [];
    for (const group of groups) {
        const horizontal = group.filter(l => Math.abs(l.y1 - l.y2) < 1), vertical = group.filter(l => Math.abs(l.x1 - l.x2) < 1);
        const unique = (values: number[]) => values.sort((a, b) => a - b).filter((v, i, a) => i === 0 || v - a[i - 1] > 2);
        const xs = unique(vertical.map(l => l.x1)), ys = unique(horizontal.map(l => l.y1));
        if (xs.length < 2 || ys.length < 2)
            continue;
        if (xs.length > 65 || ys.length > 129 || (xs.length - 1) * (ys.length - 1) > 4096)
            unsupported();
        const coverage = (segments: PdfGridLine[], position: number, from: number, to: number, horizontal: boolean) => {
            const intervals = segments.filter(l => Math.abs((horizontal ? l.y1 : l.x1) - position) <= 2).map(l => horizontal ? [Math.min(l.x1, l.x2), Math.max(l.x1, l.x2)] : [Math.min(l.y1, l.y2), Math.max(l.y1, l.y2)]).sort((a, b) => a[0] - b[0]);
            let end = from;
            for (const [start, stop] of intervals) {
                if (start > end + 2)
                    continue;
                end = Math.max(end, stop);
            }
            return end >= to - 2;
        };
        if (!coverage(horizontal, ys[0], xs[0], xs[xs.length - 1], true) || !coverage(horizontal, ys[ys.length - 1], xs[0], xs[xs.length - 1], true) ||
            !coverage(vertical, xs[0], ys[0], ys[ys.length - 1], false) || !coverage(vertical, xs[xs.length - 1], ys[0], ys[ys.length - 1], false))
            continue;
        const columns = xs.length - 1, rows = ys.length - 1, parents = Array.from({ length: columns * rows }, (_, i) => i);
        const root = (n: number): number => parents[n] === n ? n : (parents[n] = root(parents[n]));
        const join = (a: number, b: number) => { parents[root(b)] = root(a); };
        for (let r = 0; r < rows; r++)
            for (let c = 0; c < columns; c++) {
                if (c < columns - 1 && !coverage(vertical, xs[c + 1], ys[r], ys[r + 1], false))
                    join(r * columns + c, r * columns + c + 1);
                if (r < rows - 1 && !coverage(horizontal, ys[r + 1], xs[c], xs[c + 1], true))
                    join(r * columns + c, (r + 1) * columns + c);
            }
        const merged = new Map<number, number[]>();
        parents.forEach((_, i) => { const id = root(i); const members = merged.get(id) ?? []; members.push(i); merged.set(id, members); });
        const cells: GridCell[] = [];
        for (const members of merged.values()) {
            const row = Math.min(...members.map(i => Math.floor(i / columns))), column = Math.min(...members.map(i => i % columns));
            const rowSpan = Math.max(...members.map(i => Math.floor(i / columns))) - row + 1, colSpan = Math.max(...members.map(i => i % columns)) - column + 1;
            if (rowSpan * colSpan !== members.length)
                unsupported();
            cells.push({ row, column, rowSpan, colSpan, paragraphs: [], text: [], bounds: { x: xs[column], y: ys[row], width: xs[column + colSpan] - xs[column], height: ys[row + rowSpan] - ys[row] } });
        }
        grids.push({ bounds: { x: xs[0], y: ys[0], width: xs[xs.length - 1] - xs[0], height: ys[ys.length - 1] - ys[0] }, sourceIds: [], rowCount: rows, columnWidths: xs.slice(1).map((x, i) => x - xs[i]), rowHeights: ys.slice(1).map((y, i) => y - ys[i]), cells: cells.sort((a, b) => a.row - b.row || a.column - b.column) });
    }
    return grids;
}
