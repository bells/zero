/** Public diagnostic input only; no access to host log storage or paths. */
export type DiagnosticLevel = "info" | "warn" | "error" | "debug" | "trace";
export type DiagnosticOutcome = "started" | "succeeded" | "failed" | "cancelled" | "unsupported";
export interface DiagnosticEmitInput {
  level: DiagnosticLevel;
  code: string;
  phase: string;
  outcome: DiagnosticOutcome;
}
