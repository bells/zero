import { BorderStyle, Document, HeadingLevel, ImageRun, LineRuleType, Packer, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } from "docx";
import type { PdfEditablePage, PdfEditableParagraph } from "./pdfComplexity.js";
import type { PdfColumnsBlock, PdfContentBlock, PdfTableBlock } from "./pdfStructure.js";
import { assertNotCancelled } from "./engineCancellation.js";
export { assertNotCancelled, FileEngineCancelledError } from "./engineCancellation.js";
export interface PdfEditableImage {
    id?: string;
    data: Uint8Array;
    width: number;
    height: number;
}
export interface PdfDocxPage extends PdfEditablePage {
    images: PdfEditableImage[];
    blocks?: PdfContentBlock[];
}
export async function writeEditableDocx(pages: PdfDocxPage[], signal: AbortSignal): Promise<Uint8Array> {
    const sections = pages.map((page) => {
        assertNotCancelled(signal);
        return {
            properties: { page: {
                    size: { width: Math.round(page.width * 20), height: Math.round(page.height * 20) },
                    margin: page.margin ? Object.fromEntries(Object.entries(page.margin).map(([key, value]) => [key, Math.round(value * 20)])) : { top: 720, right: 720, bottom: 720, left: 720 },
                } },
            children: page.blocks ? page.blocks.length ? page.blocks.map(block => writeBlock(block, page)) : [new Paragraph({})]
                : [...page.paragraphs.map(writeParagraph), ...page.images.map(image => writeImage(image, page.width - 72, page.height - 72)),
                    ...(page.paragraphs.length === 0 && page.images.length === 0 ? [new Paragraph({})] : [])],
        };
    });
    assertNotCancelled(signal);
    const output = new Uint8Array(await (await Packer.toBlob(new Document({ sections }))).arrayBuffer());
    assertNotCancelled(signal);
    return output;
}
function writeParagraph(paragraph: PdfEditableParagraph): Paragraph {
    return new Paragraph({ spacing: paragraph.spacing ? { before: Math.round(paragraph.spacing.before * 20), after: Math.round(paragraph.spacing.after * 20), line: Math.round(paragraph.spacing.line * 20), lineRule: LineRuleType.EXACT } : { after: 100 }, alignment: paragraph.alignment,
        indent: paragraph.indent || paragraph.firstLine || paragraph.rightIndent ? { left: Math.round((paragraph.indent ?? 0) * 20), firstLine: Math.round((paragraph.firstLine ?? 0) * 20), right: Math.round((paragraph.rightIndent ?? 0) * 20) } : undefined,
        shading: paragraph.fill ? { fill: paragraph.fill } : undefined,
        heading: paragraph.heading === 1 ? HeadingLevel.HEADING_1 : paragraph.heading === 2 ? HeadingLevel.HEADING_2 : undefined,
        children: paragraph.runs.map(run => new TextRun({ text: run.text, size: Math.max(12, Math.min(144, Math.round((run.fontSize ?? run.height) * 2))), color: run.color, font: run.fontFamily, bold: run.bold, italics: run.italic })) });
}
function writeBlock(block: PdfContentBlock, page: PdfDocxPage, before = 0): Paragraph | Table {
    if (block.kind === "paragraph")
        return writeParagraph(before && block.paragraph.spacing ? { ...block.paragraph, spacing: { ...block.paragraph.spacing, before: block.paragraph.spacing.before + before } } : block.paragraph);
    if (block.kind === "table")
        return writeTable(block, page.width - 72);
    if (block.kind === "columns")
        return writeColumns(block, page);
    const image = page.images.find(image => image.id === block.figureId);
    if (!image)
        throw new Error("unsupportedInput");
    return writeImage(image, Math.min(page.width - 72, block.bounds.width), Math.min(page.height - 72, block.bounds.height), before);
}
function writeImage(image: PdfEditableImage, widthPoints: number, heightPoints: number, before = 0): Paragraph {
    const scale = Math.min(widthPoints * (96 / 72) / image.width, heightPoints * (96 / 72) / image.height);
    return new Paragraph({ spacing: { before: Math.round(before * 20), after: 0 }, children: [new ImageRun({ data: image.data, type: "png", transformation: { width: Math.max(1, image.width * scale), height: Math.max(1, image.height * scale) } })] });
}
function writeColumns(block: PdfColumnsBlock, page: PdfDocxPage): Table {
    const border = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
    return new Table({ width: { size: Math.round(block.bounds.width * 20), type: WidthType.DXA }, layout: TableLayoutType.FIXED,
        columnWidths: block.columns.map(column => Math.round(column.width * 20)),
        borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
        rows: [new TableRow({ children: block.columns.map(column => new TableCell({
            width: { size: Math.round(column.width * 20), type: WidthType.DXA },
            margins: { left: 0, right: 0, bottom: 0, top: 0 },
            children: column.blocks.map((child, index) => writeBlock(child, page, index === 0 ? Math.max(0, child.bounds.y - block.bounds.y) : 0)),
        })) })] });
}
function writeTable(table: PdfTableBlock, availableWidth: number): Table {
    const scale = Math.min(1, availableWidth / table.bounds.width);
    const border = { style: BorderStyle.SINGLE, size: 4, color: "808080" };
    return new Table({ width: { size: Math.round(table.bounds.width * scale * 20), type: WidthType.DXA },
        columnWidths: table.columnWidths.map(width => Math.round(width * scale * 20)),
        rows: Array.from({ length: table.rowCount }, (_, row) => new TableRow({ children: table.cells.filter(cell => cell.row === row).map(cell => new TableCell({
                columnSpan: cell.colSpan, rowSpan: cell.rowSpan, width: { size: Math.round(table.columnWidths.slice(cell.column, cell.column + cell.colSpan).reduce((a, b) => a + b, 0) * scale * 20), type: WidthType.DXA },
                borders: { top: border, bottom: border, left: border, right: border }, children: cell.paragraphs.length ? cell.paragraphs.map(writeParagraph) : [new Paragraph({})],
            })) })) });
}
