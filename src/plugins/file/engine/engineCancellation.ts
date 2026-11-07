export class FileEngineCancelledError extends Error {
  override name = "FileEngineCancelledError";
}

export function assertNotCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new FileEngineCancelledError("Conversion cancelled.");
}
