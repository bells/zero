import { Document, ImageRun, Packer, Paragraph, TextRun } from "docx";
import type { PdfEditablePage } from "./pdfComplexity.js";

export interface PdfEditableImage { data: Uint8Array; width: number; height: number }
export interface PdfDocxPage extends PdfEditablePage { images: PdfEditableImage[] }

export class FileEngineCancelledError extends Error { override name = "FileEngineCancelledError" }
export function assertNotCancelled(signal: AbortSignal) {
  if (signal.aborted) throw new FileEngineCancelledError("Conversion cancelled.");
}

export async function writeEditableDocx(pages: PdfDocxPage[], signal: AbortSignal): Promise<Uint8Array> {
  const sections = pages.map((page) => {
    assertNotCancelled(signal);
    return {
      properties: { page: {
        size: { width: Math.round(page.width * 20), height: Math.round(page.height * 20) },
        margin: { top: 720, right: 720, bottom: 720, left: 720 },
      } },
      children: [
        ...page.paragraphs.map((paragraph) => new Paragraph({
          spacing: { after: 100 },
          children: paragraph.runs.map((run) => new TextRun({
            text: run.text, size: Math.max(12, Math.min(144, Math.round(run.height * 2))),
            font: run.fontFamily, bold: run.bold, italics: run.italic,
          })),
        })),
        ...page.images.map((image) => {
          const scale = Math.min(1, (page.width - 72) * (96 / 72) / image.width, 400 / image.height);
          return new Paragraph({ children: [new ImageRun({
            data: image.data, type: "png",
            transformation: { width: Math.max(1, Math.round(image.width * scale)), height: Math.max(1, Math.round(image.height * scale)) },
          })] });
        }),
        ...(page.paragraphs.length === 0 && page.images.length === 0 ? [new Paragraph({})] : []),
      ],
    };
  });
  assertNotCancelled(signal);
  const output = new Uint8Array(await (await Packer.toBlob(new Document({ sections }))).arrayBuffer());
  assertNotCancelled(signal);
  return output;
}
