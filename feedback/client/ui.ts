import {
  isRecord,
  isThread,
  type FeedbackPage,
  type PublicFeedback,
  type ErrorCode,
} from "../shared/contracts.ts";
export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}
export function field(text: string, name: string, type = "text") {
  const label = element("label", text);
  const input = element("input");
  input.name = name;
  input.type = type;
  input.autocomplete = "off";
  label.append(input);
  return { label, input };
}
export class RequestError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode) {
    super(code);
    this.code = code;
  }
}
export async function request(
  path: string,
  method = "GET",
  data?: unknown,
  token?: string,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(path, {
      method,
      signal: controller.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: {
        ...(data === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    const value: unknown = await response.json();
    if (!response.ok) {
      const code =
        isRecord(value) && typeof value.code === "string"
          ? value.code
          : "unavailable";
      throw new RequestError(
        [
          "invalid_input",
          "unauthorized",
          "forbidden",
          "not_found",
          "rate_limited",
          "unavailable",
          "conflict",
          "timeout",
        ].includes(code)
          ? (code as ErrorCode)
          : "unavailable",
      );
    }
    return value;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(
      controller.signal.aborted ? "timeout" : "unavailable",
    );
  } finally {
    clearTimeout(timer);
  }
}
export function readPage(value: unknown): FeedbackPage {
  if (
    !isRecord(value) ||
    !Array.isArray(value.items) ||
    value.items.length > 20 ||
    (value.nextCursor !== null &&
      (typeof value.nextCursor !== "string" ||
        !/^\d{1,8}$/.test(value.nextCursor)))
  )
    throw new RequestError("unavailable");
  const items: PublicFeedback[] = value.items.map((row: unknown) => {
    if (
      !isRecord(row) ||
      typeof row.id !== "string" ||
      !isThread(row.threadId) ||
      typeof row.content !== "string" ||
      typeof row.displayName !== "string" ||
      typeof row.createdAt !== "string" ||
      !Number.isFinite(Date.parse(row.createdAt)) ||
      !["visitor", "owner"].includes(String(row.authorRole)) ||
      (row.parentId !== undefined && typeof row.parentId !== "string")
    )
      throw new RequestError("unavailable");
    return {
      id: row.id,
      threadId: row.threadId,
      content: row.content,
      displayName: row.displayName,
      createdAt: row.createdAt,
      authorRole: row.authorRole as "visitor" | "owner",
      ...(typeof row.parentId === "string" ? { parentId: row.parentId } : {}),
    };
  });
  return { items, nextCursor: value.nextCursor as string | null };
}
export function setThemeControl(labelText: string, options: string[]) {
  const label = element("label", labelText);
  const select = element("select");
  ["system", "light", "dark"].forEach((value, index) => {
    const option = element("option", options[index]);
    option.value = value;
    select.append(option);
  });
  select.addEventListener("change", () => {
    document.documentElement.dataset.theme = select.value;
  });
  label.append(select);
  return label;
}
