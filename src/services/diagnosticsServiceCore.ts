import type { AboutInfo, DiagnosticMode, DiagnosticsPreview, DiagnosticsStatus, ModeInput, PreviewCopyInput, SupportLinkInput, SupportTarget } from "../core/diagnostics/contracts";
export type DiagnosticsCommand = "get_about_info" | "get_diagnostics_status" | "get_diagnostics_preview" | "copy_diagnostics_preview" | "open_support_link" | "open_diagnostics_directory" | "clear_diagnostics" | "set_diagnostics_mode";
export interface DiagnosticsArgs { input: PreviewCopyInput | SupportLinkInput | ModeInput }
export type DiagnosticsInvoke = <T>(command: DiagnosticsCommand, args?: DiagnosticsArgs) => Promise<T>;
export function createDiagnosticsService(invoke: DiagnosticsInvoke) {
  return {
    about: () => invoke<AboutInfo>("get_about_info"),
    status: () => invoke<DiagnosticsStatus>("get_diagnostics_status"),
    preview: () => invoke<DiagnosticsPreview>("get_diagnostics_preview"),
    copy: (previewId: string) => invoke<void>("copy_diagnostics_preview", { input: { previewId } }),
    openLink: (target: SupportTarget) => invoke<void>("open_support_link", { input: { target } }),
    openDirectory: () => invoke<void>("open_diagnostics_directory"),
    clear: () => invoke<void>("clear_diagnostics"),
    mode: (mode: DiagnosticMode) => invoke<DiagnosticsStatus>("set_diagnostics_mode", { input: { mode } }),
  };
}
const errors = {
  callerDenied: "diagnostics.error.callerDenied", invalidInput: "diagnostics.error.invalidInput",
  unavailable: "diagnostics.error.unavailable", storageFailed: "diagnostics.error.storageFailed",
  clipboardFailed: "diagnostics.error.clipboardFailed", openerFailed: "diagnostics.error.openerFailed",
  previewExpired: "diagnostics.error.previewExpired", verboseRequired: "diagnostics.error.verboseRequired",
  rateLimited: "diagnostics.error.rateLimited",
} as const;
export function diagnosticsErrorKey(error: unknown): typeof errors[keyof typeof errors] {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" && Object.prototype.hasOwnProperty.call(errors, error.code)) {
    return errors[error.code as keyof typeof errors];
  }
  return errors.unavailable;
}
