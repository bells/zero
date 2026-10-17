export interface FeedbackEnvironment {
  PUBLIC_FEEDBACK_ENABLED?: string;
  PUBLIC_FEEDBACK_ORIGIN?: string;
  PUBLIC_FEEDBACK_PREVIEW_ORIGIN?: string;
  FEEDBACK_ALLOWED_ORIGINS?: string;
  FEEDBACK_LOCAL_TEST?: string;
  SITE_PREVIEW?: string | boolean;
  VERCEL_ENV?: string;
}
export interface FeedbackConfiguration {
  origin: string;
}
export function getFeedbackConfiguration(
  env: FeedbackEnvironment,
  siteOrigin: string,
): FeedbackConfiguration | null {
  if (env.PUBLIC_FEEDBACK_ENABLED !== "1") return null;
  const preview =
    env.SITE_PREVIEW === true ||
    env.SITE_PREVIEW === "1" ||
    env.VERCEL_ENV === "preview";
  const raw = preview
    ? env.PUBLIC_FEEDBACK_PREVIEW_ORIGIN
    : env.PUBLIC_FEEDBACK_ORIGIN;
  if (!raw || (preview && raw === env.PUBLIC_FEEDBACK_ORIGIN)) return null;
  try {
    const url = new URL(raw);
    if (
      preview &&
      env.PUBLIC_FEEDBACK_ORIGIN &&
      url.origin === new URL(env.PUBLIC_FEEDBACK_ORIGIN).origin
    )
      return null;
    const local =
      env.FEEDBACK_LOCAL_TEST === "1" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.origin === new URL(siteOrigin).origin
    )
      return null;
    const allowed = (env.FEEDBACK_ALLOWED_ORIGINS || "")
      .split(",")
      .map((value) => value.trim());
    return allowed.includes(url.origin) ? { origin: url.origin } : null;
  } catch {
    return null;
  }
}
export type FeedbackMessage =
  | { version: 1; type: "ready" }
  | { version: 1; type: "resize"; height: number }
  | { version: 1; type: "error"; code: "unavailable" | "timeout" };
export function isFeedbackMessage(value: unknown): value is FeedbackMessage {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const record = value as Record<string, unknown>;
  if (record.version !== 1) return false;
  const keys = Object.keys(record);
  if (record.type === "ready") return keys.length === 2;
  if (record.type === "resize")
    return (
      keys.length === 3 &&
      typeof record.height === "number" &&
      Number.isFinite(record.height) &&
      record.height >= 240 &&
      record.height <= 1600
    );
  return (
    record.type === "error" &&
    keys.length === 3 &&
    ["unavailable", "timeout"].includes(String(record.code))
  );
}
