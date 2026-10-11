export interface PdfTextSample {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDegrees: number;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
}

export interface PdfPageComplexityInput {
  width: number;
  height: number;
  text: PdfTextSample[];
  vectorOperationCount: number;
  imageCount: number;
}

export class PdfReconstructionError extends Error {
  override name = "PdfReconstructionError";
  constructor(public readonly code: "ocrRequired" | "unsupportedInput") {
    super(code);
  }
}

export interface PdfEditableParagraph { runs: PdfTextSample[] }
export interface PdfEditablePage {
  width: number;
  height: number;
  paragraphs: PdfEditableParagraph[];
  warningKeys: string[];
}
export interface PdfComplexityDecision {
  profile: "editableReconstruction";
  signals: string[];
}

export function classifyPdfComplexity(pages: PdfPageComplexityInput[]): PdfComplexityDecision {
  const reconstructed = pages.map(reconstructPdfPage);
  if (!reconstructed.some((page) => page.paragraphs.length > 0)) throw new PdfReconstructionError("unsupportedInput");
  return { profile: "editableReconstruction", signals: [...new Set(reconstructed.flatMap((page) => page.warningKeys))].sort() };
}

export function reconstructPdfPage(page: PdfPageComplexityInput): PdfEditablePage {
  if (!Number.isFinite(page.width) || !Number.isFinite(page.height) ||
      page.width <= 0 || page.height <= 0 || page.text.length > 50_000) {
    throw new PdfReconstructionError("unsupportedInput");
  }
  const items = page.text.filter((item) => item.text.trim().length > 0);
  if (items.length === 0) {
    if (page.imageCount > 0) throw new PdfReconstructionError("ocrRequired");
    if (page.vectorOperationCount > 0) throw new PdfReconstructionError("unsupportedInput");
    return { width: page.width, height: page.height, paragraphs: [], warningKeys: [] };
  }
  if (items.reduce((sum, item) => sum + item.text.length, 0) > 1_000_000 || items.some((item) => !validText(item))) {
    throw new PdfReconstructionError("unsupportedInput");
  }
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: PdfTextSample[][] = [];
  for (const item of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - item.y) <= Math.max(2, Math.min(row[0].height, item.height) * 0.4)) row.push(item);
    else rows.push([item]);
  }
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    for (let index = 1; index < row.length; index += 1) {
      const previous = row[index - 1];
      if (row[index].x < previous.x + previous.width - Math.max(2, previous.height * 0.3)) {
        throw new PdfReconstructionError("unsupportedInput");
      }
    }
  }
  const gutter = columnGutter(items, page.width);
  const ordered: PdfTextSample[][] = [];
  let block: PdfTextSample[][] = [];
  const flush = () => {
    if (gutter === null) ordered.push(...block);
    else {
      ordered.push(...block.map((row) => row.filter((item) => item.x < gutter)).filter((row) => row.length));
      ordered.push(...block.map((row) => row.filter((item) => item.x >= gutter)).filter((row) => row.length));
    }
    block = [];
  };
  for (const row of rows) {
    if (gutter !== null && row.some((item) => item.x < gutter && item.x + item.width > gutter)) {
      flush();
      ordered.push(row);
    } else block.push(row);
  }
  flush();
  const paragraphs: PdfEditableParagraph[] = [];
  let previous: PdfTextSample[] | undefined;
  const tableLike = page.vectorOperationCount > 16;
  for (const row of ordered) {
    const first = row[0];
    const continues = previous && !tableLike && first.y > previous[0].y &&
      first.y - previous[0].y < first.height * 1.7 && Math.abs(first.x - previous[0].x) < first.height &&
      Math.abs(first.height - previous[0].height) < first.height * 0.2;
    const runs = spacedRow(row);
    if (continues) {
      const paragraph = paragraphs[paragraphs.length - 1];
      paragraph.runs.push({ ...first, text: joiningSpace(paragraph.runs[paragraph.runs.length - 1].text, first.text) }, ...runs);
    } else paragraphs.push({ runs });
    previous = row;
  }
  const warningKeys = [];
  if (gutter !== null || tableLike || page.vectorOperationCount > 0) warningKeys.push("file.quality.structureSimplified");
  if (page.imageCount > 0) warningKeys.push("file.quality.imagesRetained");
  return { width: page.width, height: page.height, paragraphs, warningKeys };
}

function validText(item: PdfTextSample) {
  const rotation = Math.abs(((item.rotationDegrees + 180) % 360 + 360) % 360 - 180);
  return [item.x, item.y, item.width, item.height, item.rotationDegrees].every(Number.isFinite) &&
    item.width >= 0 && item.height > 0 && rotation <= 2 &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/u.test(item.text);
}

function columnGutter(items: PdfTextSample[], width: number): number | null {
  const intervals = items.filter((item) => item.width < width * 0.55)
    .map((item) => [item.x, item.x + item.width]).sort((a, b) => a[0] - b[0]);
  const merged: number[][] = [];
  for (const interval of intervals) {
    const last = merged[merged.length - 1];
    if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
    else merged.push([...interval]);
  }
  const candidates = merged.slice(1).map((interval, index) => ({
    gap: interval[0] - merged[index][1], middle: (interval[0] + merged[index][1]) / 2,
  })).filter(({ gap, middle }) => gap >= width * 0.04 && middle > width * 0.3 && middle < width * 0.7)
    .sort((a, b) => b.gap - a.gap);
  for (const { middle } of candidates) {
    if (items.filter((item) => item.x + item.width <= middle).length >= 3 &&
        items.filter((item) => item.x >= middle).length >= 3) return middle;
  }
  return null;
}

function spacedRow(row: PdfTextSample[]): PdfTextSample[] {
  const runs: PdfTextSample[] = [];
  for (const [index, item] of row.entries()) {
    const previous = row[index - 1];
    if (previous && item.x - previous.x - previous.width > Math.max(1, item.height * 0.15)) {
      const space = joiningSpace(previous.text, item.text);
      if (space && !/\s$/u.test(previous.text) && !/^\s/u.test(item.text)) runs.push({ ...item, text: space });
    }
    runs.push(item);
  }
  return runs;
}

function joiningSpace(left: string, right: string) {
  if (/\s$/u.test(left) || /^\s/u.test(right)) return "";
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(left) &&
    /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}，。！？；：]/u.test(right) ? "" : " ";
}
