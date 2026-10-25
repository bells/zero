export function screenshotFailureMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return typeof error === "string" ? error : "Unknown screenshot error";
}
