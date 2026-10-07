import type { JsonValue, PluginRequest } from "./contracts";

export function parsePluginRequest(value: unknown): PluginRequest | null {
  if (!record(value) || !fields(value, ["protocolVersion", "requestId", "sessionId", "generation", "method", "payload"])) return null;
  if (value.protocolVersion !== "1.0.0" || !identifier(value.requestId) || !identifier(value.sessionId)
    || typeof value.generation !== "number" || !Number.isSafeInteger(value.generation) || value.generation < 0
    || !record(value.payload)) return null;
  const common = { protocolVersion: value.protocolVersion, requestId: value.requestId,
    sessionId: value.sessionId, generation: value.generation } as const;
  const payload = value.payload;
  switch (value.method) {
    case "ui.showMessage":
      return fields(payload, ["message"]) && typeof payload.message === "string"
        ? { ...common, method: value.method, payload: { message: payload.message } } : null;
    case "storage.get":
      return fields(payload, ["key"]) && typeof payload.key === "string"
        ? { ...common, method: value.method, payload: { key: payload.key } } : null;
    case "storage.set":
      return fields(payload, ["key", "value"]) && typeof payload.key === "string" && jsonValue(payload.value)
        ? { ...common, method: value.method, payload: { key: payload.key, value: payload.value } } : null;
    case "network.fetch":
      return fields(payload, ["url", "method"]) && typeof payload.url === "string" && payload.method === "GET"
        ? { ...common, method: value.method, payload: { url: payload.url, method: "GET" } } : null;
    default: return null;
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function fields(value: Record<string, unknown>, names: string[]): boolean {
  return Object.keys(value).length === names.length && names.every(name => Object.prototype.hasOwnProperty.call(value, name));
}
function identifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
function jsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > 32) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(item => jsonValue(item, depth + 1));
  return record(value) && Object.values(value).every(item => jsonValue(item, depth + 1));
}
