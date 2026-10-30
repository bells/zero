export const threads = [
  "tools",
  "tools/timestamp",
  "tools/json",
  "tools/base64",
  "tools/diff",
  "tools/unicode",
  "tools/image-converter",
  "tools/image-watermark",
  "tools/image-compressor",
  "tools/markdown",
] as const;
export type ThreadId = (typeof threads)[number];
export type Locale = "zh" | "en";
export interface CreateFeedbackRequest {
  threadId: ThreadId;
  content: string;
  nickname?: string;
  email?: string;
  idempotencyKey: string;
}
export interface CreateFeedbackResult {
  receiptId: string;
  status: "awaiting_moderation";
}
export interface PublicFeedback {
  id: string;
  threadId: ThreadId;
  content: string;
  displayName: string;
  createdAt: string;
  authorRole: "visitor" | "owner";
  parentId?: string;
}
export interface FeedbackPage {
  items: PublicFeedback[];
  nextCursor: string | null;
}
export type ErrorCode =
  | "invalid_input"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "unavailable"
  | "conflict"
  | "timeout";
export interface FeedbackError {
  code: ErrorCode;
  retryAfterSeconds?: number;
}
export type FrameMessage =
  | { version: 1; type: "ready" }
  | { version: 1; type: "resize"; height: number }
  | { version: 1; type: "error"; code: "unavailable" | "timeout" };
export function isThread(value: unknown): value is ThreadId {
  return (
    typeof value === "string" && threads.some((thread) => thread === value)
  );
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function codePoints(value: string): number {
  return [...value].length;
}
export function parseCreate(value: unknown): CreateFeedbackRequest | null {
  if (!isRecord(value)) return null;
  const allowed = [
    "threadId",
    "content",
    "nickname",
    "email",
    "idempotencyKey",
  ];
  if (Object.keys(value).some((key) => !allowed.includes(key))) return null;
  if (
    !isThread(value.threadId) ||
    typeof value.content !== "string" ||
    typeof value.idempotencyKey !== "string"
  )
    return null;
  if (!/^[a-zA-Z0-9_-]{20,80}$/.test(value.idempotencyKey)) return null;
  const content = value.content.trim();
  if (codePoints(content) < 1 || codePoints(content) > 2000) return null;
  const optionalText = (field: unknown) =>
    field === undefined ? "" : typeof field === "string" ? field.trim() : null;
  const nickname = optionalText(value.nickname);
  const email = optionalText(value.email);
  if (
    nickname === null ||
    email === null ||
    codePoints(nickname) > 40 ||
    new TextEncoder().encode(email).length > 254
  )
    return null;
  if (email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return null;
  return {
    threadId: value.threadId,
    content,
    nickname,
    email,
    idempotencyKey: value.idempotencyKey,
  };
}
