export type DiagnosticLevel = "info" | "warn" | "error" | "debug" | "trace";
export type DiagnosticOutcome = "started" | "succeeded" | "failed" | "cancelled" | "unsupported";
export type DiagnosticMode = "normal" | "verbose";
export type SupportTarget = "github" | "website" | "issues";
export interface PreviewCopyInput { previewId: string }
export interface ModeInput { mode: DiagnosticMode }
export interface SupportLinkInput { target: SupportTarget }
export interface DiagnosticEmitInput { level: DiagnosticLevel; code: string; phase: string; outcome: DiagnosticOutcome }
export interface FrontendDiagnosticInput { pluginId: string | null; event: DiagnosticEmitInput }
export interface SafeDiagnosticMetadata {
  count?: number; durationMs?: number; httpStatus?: number;
  backend?: "macos" | "windows" | "unsupported" | "builtIn" | "compatibility";
  cacheHit?: boolean; approved?: boolean; devFallback?: boolean;
}
export interface DiagnosticEvent {
  schemaVersion: number; timestamp: string; level: DiagnosticLevel;
  source: "host" | "native" | "frontend" | "engine" | "extension";
  pluginId: string | null; code: string; phase: string; outcome: DiagnosticOutcome;
  runId: string; operationId: string | null; metadata: SafeDiagnosticMetadata; repeatCount: number; storageEpoch: number;
}
export interface AboutInfo { appName: string; appVersion: string; githubUrl: string; websiteUrl: string; issuesUrl: string }
export interface DiagnosticsError { code: string; messageKey: string; retryable: boolean }
export interface DiagnosticsStatus {
  persistence: "healthy" | "memoryOnly" | "degraded"; droppedEvents: number;
  mode: DiagnosticMode; verboseRemainingSeconds: number;
}
export interface DiagnosticsPreview {
  schemaVersion: number; previewId: string; generatedAt: string;
  persistence: DiagnosticsStatus["persistence"]; droppedEvents: number; truncated: boolean;
  omissions: string[]; text: string;
}

export interface DiagnosticProviderSnapshot {
  provider: "zeroFilePdfToDocx" | "zeroFileDocxToPdfMacos" | "libreOffice" | "microsoftWordMacos" | "microsoftWordWindows";
  available: boolean; version: string | null; engineVersion: string | null; packageVersion: string | null;
}
export interface DiagnosticHealthSnapshot {
  state: "ready" | "active" | "disabled" | "notInitialized" | "unsupported" | "degraded" | "unknown";
  metadata: SafeDiagnosticMetadata; providers: DiagnosticProviderSnapshot[];
}
