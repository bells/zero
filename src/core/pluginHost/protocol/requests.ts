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
    case "screen.captureDisplay":
    case "documents.chooseInput":
    case "screen.openSystemCapture":
    case "apps.scan":
      return fields(payload, []) ? {...common, method:value.method, payload:{}} : null;
    case "screen.releaseCapture":
      return fields(payload, ["captureId"]) && catalogToken(payload.captureId)
        ? {...common, method:value.method, payload:{captureId:payload.captureId}} : null;
    case "screen.setCapturePinned":
      return fields(payload, ["captureId", "pinned"]) && catalogToken(payload.captureId) && typeof payload.pinned === "boolean"
        ? {...common, method:value.method, payload:{captureId:payload.captureId, pinned:payload.pinned}} : null;
    case "screen.prepareCaptureExport":
      return fields(payload, ["captureId", "action"]) && catalogToken(payload.captureId)
        && (payload.action === "copy" || payload.action === "save")
        ? {...common, method:value.method, payload:{captureId:payload.captureId, action:payload.action}} : null;
    case "screen.commitCaptureExport":
      return fields(payload, ["leaseId"]) && catalogToken(payload.leaseId)
        ? {...common, method:value.method, payload:{leaseId:payload.leaseId}} : null;
    case "documents.start":
    case "documents.status":
    case "documents.cancel":
    case "documents.reveal":
      return fields(payload, ["id"]) && catalogToken(payload.id)
        ? {...common, method:value.method, payload:{id:payload.id}} : null;
    case "apps.page":
      return fields(payload, ["catalogId", "offset"]) && catalogToken(payload.catalogId)
        && typeof payload.offset === "number" && Number.isSafeInteger(payload.offset) && payload.offset >= 0 && payload.offset <= 4096
        ? {...common, method:value.method, payload:{catalogId:payload.catalogId, offset:payload.offset}} : null;
    case "apps.activate":
      return fields(payload, ["catalogId", "itemId"]) && catalogToken(payload.catalogId) && catalogToken(payload.itemId)
        ? {...common, method:value.method, payload:{catalogId:payload.catalogId, itemId:payload.itemId}} : null;
    case "media.cacheImage":
      return fields(payload,["url"]) && typeof payload.url==="string" ? {...common,method:value.method,payload:{url:payload.url}} : null;
    case "media.preview":
      return fields(payload,["assetId"]) && typeof payload.assetId==="string" ? {...common,method:value.method,payload:{assetId:payload.assetId}} : null;
    case "media.releasePreview":
      return fields(payload,["leaseId"]) && typeof payload.leaseId==="string" ? {...common,method:value.method,payload:{leaseId:payload.leaseId}} : null;
    case "media.exportImage":
      return fields(payload,["assetId","suggestedName"]) && typeof payload.assetId==="string" && typeof payload.suggestedName==="string" ? {...common,method:value.method,payload:{assetId:payload.assetId,suggestedName:payload.suggestedName}} : null;
    case "wallpaper.prepare":
      return fields(payload,["assetId","claimId"]) && typeof payload.assetId==="string" && typeof payload.claimId==="string" ? {...common,method:value.method,payload:{assetId:payload.assetId,claimId:payload.claimId}} : null;
    case "wallpaper.apply":
    case "wallpaper.cancelPrepared":
      return fields(payload,["intentId"]) && typeof payload.intentId==="string" ? {...common,method:value.method,payload:{intentId:payload.intentId}} : null;
    case "wallpaper.platform":
    case "wallpaper.recover":
      return fields(payload,[]) ? {...common,method:value.method,payload:{}} : null;
    case "diagnostics.emit": {
      if (!fields(payload, ["level", "code", "phase", "outcome"]) || typeof payload.code !== "string" || typeof payload.phase !== "string"
        || !diagnosticIdentifier(payload.code, 64) || !diagnosticIdentifier(payload.phase, 32)
        || !diagnosticLevel(payload.level) || !diagnosticOutcome(payload.outcome)) return null;
      return { ...common, method: value.method, payload: { level: payload.level, code: payload.code, phase: payload.phase, outcome: payload.outcome } };
    }

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
function catalogToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
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

function diagnosticLevel(value: unknown): value is import("../../diagnostics/contracts").DiagnosticLevel {
  return typeof value === "string" && ["info", "warn", "error", "debug", "trace"].includes(value);
}
function diagnosticIdentifier(value: string, limit: number): boolean {
  return value.length <= limit && /^[a-z][a-z0-9_.-]*$/.test(value)
    && !["sk-", "sk_live_", "sk_test_", "ghp_", "gho_", "github_pat_", "xoxb-", "xoxp-"]
      .some(prefix => value.startsWith(prefix) || value.includes(`.${prefix}`));
}
function diagnosticOutcome(value: unknown): value is import("../../diagnostics/contracts").DiagnosticOutcome {
  return typeof value === "string" && ["started", "succeeded", "failed", "cancelled", "unsupported"].includes(value);
}
