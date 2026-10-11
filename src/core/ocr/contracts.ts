export interface OcrRect { x: number; y: number; width: number; height: number }
export interface OcrLine { text: string; bounds: OcrRect; confidence: number }
export interface OcrPageResult { width: number; height: number; lines: OcrLine[]; warnings: string[] }
export interface OcrCapability { available: boolean; languages: string[]; reason: string | null }
export type OcrError = "unsupportedPlatform" | "providerUnavailable" | "languageUnavailable" | "invalidInput" | "resourceLimit" | "busy" | "timeout" | "cancelled" | "recognitionFailed" | "unauthorized";

const OCR_ERRORS: readonly OcrError[] = ["unsupportedPlatform", "providerUnavailable", "languageUnavailable", "invalidInput", "resourceLimit", "busy", "timeout", "cancelled", "recognitionFailed", "unauthorized"];
export function normalizeOcrError(value: unknown): OcrError {
  return typeof value === "string" && OCR_ERRORS.some(error => error === value) ? value as OcrError : "recognitionFailed";
}
