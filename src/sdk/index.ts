import type {
  Disposable, JsonValue, PluginContext, PluginError, PluginMethod, PluginMethodMap,
  PluginRequest, PluginResponse, PluginSessionInfo, Result, ZeroBridge, ZeroPluginDefinition,
} from "./contracts.js";
export type * from "./contracts.js";
export type * from "./diagnostics.js";
export type { OfficialPackageSignature } from "./publisher.js";
export { compareCapabilities } from "./capabilities.js";

export interface PluginTransport {
  readonly session: Readonly<PluginSessionInfo>;
  ready(): Promise<PluginSessionInfo>;
  request(request: PluginRequest): Promise<PluginResponse>;
  cancel(request: PluginRequest): Promise<void>;
}
export interface PluginRegistration extends Disposable {
  ready: Promise<Result<Readonly<PluginContext>>>;
}
const failure = (code: string, message = code): { ok: false; error: PluginError } =>
  ({ ok: false, error: { code, message, retryable: false } });

function hostFailure(error: unknown): { ok: false; error: PluginError } {
  if (typeof error === "object" && error !== null && "code" in error && "message" in error
    && typeof error.code === "string" && typeof error.message === "string") {
    return failure(error.code, error.message);
  }
  return failure("transport.failed", error instanceof Error ? error.message : "Host request failed");
}

function transportFromHost(): PluginTransport {
  const host = globalThis as typeof globalThis & { __ZERO_PLUGIN_TRANSPORT__?: PluginTransport };
  if (!host.__ZERO_PLUGIN_TRANSPORT__) throw new Error("Zero plugin transport is unavailable");
  return host.__ZERO_PLUGIN_TRANSPORT__;
}

export function createZeroBridge(transport: PluginTransport, lifetime: AbortSignal): ZeroBridge {
  const bridge: ZeroBridge = {
    schedule: {upsert: input => bridge.request("schedule.upsert", input), cancel: input => bridge.request("schedule.cancel", input)},
    background: {complete: input => bridge.request("background.complete", input)},
    request<M extends PluginMethod>(method: M, payload: PluginMethodMap[M]["input"], options?: { signal?: AbortSignal }) {
      if (lifetime.aborted || options?.signal?.aborted) return Promise.resolve(failure("request.cancelled"));
      const request = {
        protocolVersion: "1.0.0", requestId: crypto.randomUUID(),
        sessionId: transport.session.sessionId, generation: transport.session.generation, method, payload,
      } as PluginRequest;
      return new Promise<Result<PluginMethodMap[M]["output"]>>(resolve => {
        let settled = false;
        let timeout: ReturnType<typeof setTimeout>;
        const finish = (result: Result<PluginMethodMap[M]["output"]>) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          lifetime.removeEventListener("abort", cancel);
          options?.signal?.removeEventListener("abort", cancel);
          resolve(result);
        };
        const cancelNative = () => { void transport.cancel(request).catch(() => undefined); };
        const cancel = () => { finish(failure("request.cancelled")); cancelNative(); };
        lifetime.addEventListener("abort", cancel, { once: true });
        options?.signal?.addEventListener("abort", cancel, { once: true });
        const deadlineMs = method === "media.exportImage" ? 120_000 : 10_000;
        timeout = setTimeout(() => { finish(failure("request.timeout")); cancelNative(); }, deadlineMs);
        if (lifetime.aborted || options?.signal?.aborted) { cancel(); return; }
        Promise.resolve().then(() => settled ? undefined : transport.request(request)).then(response => {
          if (settled) return;
          if (!response || response.requestId !== request.requestId) { finish(failure("transport.invalid")); return; }
          if (response.ok === false) {
            finish(response.error && typeof response.error.code === "string" && typeof response.error.message === "string"
              ? { ok: false, error: response.error } : failure("transport.invalid"));
            return;
          }
          if (!validOutput(method, response.value)) { finish(failure("transport.invalid")); return; }
          finish({ ok: true, value: response.value as PluginMethodMap[M]["output"] });
        }).catch((error: unknown) => finish(hostFailure(error)));
      });
    },
  };
  return bridge;
}
function validOutput(method: PluginMethod, value: JsonValue): boolean {
  if (method === "media.cacheImage") return exact(value,["assetId","byteLength","width","height","mimeType"]) && token(value.assetId) && imageSize(value,25*1024*1024) && ["image/jpeg","image/png"].includes(String(value.mimeType));
  if (method === "media.preview") {
    return exact(value, ["leaseId", "url", "byteLength", "width", "height", "mimeType"])
      && token(value.leaseId) && value.url === `/__zero_preview/${value.leaseId}`
      && imageSize(value, 2 * 1024 * 1024) && value.mimeType === "image/jpeg"
      && (value.width as number) <= 960 && (value.height as number) <= 600;
  }
  if (method === "wallpaper.platform") return record(value) && Object.keys(value).every(key=>["platform","supported","detail"].includes(key)) && typeof value.platform==="string" && ["macos","windows","linux","unknown"].includes(value.platform) && typeof value.supported==="boolean" && (value.detail===undefined || typeof value.detail==="string" && value.detail.length<=1024);
  if (method === "wallpaper.prepare") return exact(value,["intentId","generation"]) && token(value.intentId) && typeof value.generation==="number" && Number.isSafeInteger(value.generation) && value.generation>0;
  if (method === "wallpaper.apply") return exact(value,["outcome"]) && ["applied","alreadyApplied"].includes(String(value.outcome));
  if (method === "media.exportImage") return exact(value,["cancelled","fileName"]) && typeof value.cancelled==="boolean" && (value.cancelled ? value.fileName===null : typeof value.fileName==="string" && value.fileName.length>0 && value.fileName.length<=180 && !/[\\/\x00-\x1f]/.test(value.fileName));
  if (method === "schedule.upsert") return record(value) && typeof value.generation === "number" && Number.isSafeInteger(value.generation) && value.generation > 0;
  if (method === "schedule.cancel") return record(value) && typeof value.cancelled === "boolean";
  if (method === "background.complete") return record(value) && (value.generation === null || typeof value.generation === "number" && Number.isSafeInteger(value.generation) && value.generation > 0);
  if (method === "storage.get") return true;
  if (method === "storage.compareAndSet") return record(value) && typeof value.swapped === "boolean" && "currentValue" in value;
  if (method === "power.taskStatus") return value === null || validPowerTask(value);
  if (method === "power.startTask" || method === "power.updateTaskConditions") return validPowerTask(value);
  if (method === "power.readSnapshot") return validPowerSnapshot(value);
  if (method === "power.acquire") return validPowerLease(value);
  if (method === "power.status") return value !== null && typeof value === "object" && !Array.isArray(value)
    && Array.isArray(value.leases) && value.leases.length <= 4 && value.leases.every(validPowerLease);

  if (method === "network.fetch") return value !== null && typeof value === "object" && !Array.isArray(value)
    && typeof value.status === "number" && Number.isInteger(value.status)
    && (typeof value.contentType === "string" || value.contentType === null) && typeof value.bodyBase64 === "string";
  return value === null;
}

function exact(value:JsonValue, keys:string[]): value is {[key:string]:JsonValue} {return record(value) && Object.keys(value).length===keys.length && keys.every(key=>key in value);}
function token(value:JsonValue|undefined):boolean {return typeof value==="string" && /^[a-f0-9]{64}$/.test(value);}
function imageSize(value:{[key:string]:JsonValue}, max:number):boolean {return typeof value.byteLength==="number" && Number.isSafeInteger(value.byteLength) && value.byteLength>0 && value.byteLength<=max && typeof value.width==="number" && Number.isSafeInteger(value.width) && value.width>0 && typeof value.height==="number" && Number.isSafeInteger(value.height) && value.height>0 && value.width*value.height<=40_000_000;}
function validPowerLease(value: JsonValue): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && typeof value.leaseId === "string" && value.leaseId.length > 0 && value.leaseId.length <= 128
    && typeof value.generation === "number" && Number.isSafeInteger(value.generation) && value.generation > 0
    && (value.expiresAtMs === null || (typeof value.expiresAtMs === "number"
      && Number.isSafeInteger(value.expiresAtMs) && value.expiresAtMs >= 0));
}

function record(value: JsonValue | undefined): value is {[key:string]:JsonValue} { return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value); }
function nonnegative(value: JsonValue | undefined): boolean { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function validPowerTask(value: JsonValue): boolean {
  if (!record(value) || !record(value.schedule) || !record(value.conditions)) return false;
  const schedule=value.schedule, conditions=value.conditions;
  return typeof value.generation === "number" && Number.isSafeInteger(value.generation) && value.generation>0
    && typeof value.conditionsRevision === "number" && Number.isSafeInteger(value.conditionsRevision) && value.conditionsRevision>0
    && typeof value.active === "boolean" && nonnegative(value.startedAtMs) && nonnegative(value.elapsedMs)
    && (value.expiresAtMs===null || nonnegative(value.expiresAtMs)) && (value.remainingMs===null || nonnegative(value.remainingMs))
    && typeof value.batteryThresholdOverridden === "boolean" && typeof value.protectionUnavailable === "boolean"
    && (value.lastStopReason===null || typeof value.lastStopReason === "string")
    && (schedule.kind === "unlimited" || schedule.kind === "duration" && typeof schedule.minutes === "number" && Number.isInteger(schedule.minutes) && schedule.minutes>=1 && schedule.minutes<=1440 || schedule.kind === "until" && nonnegative(schedule.expiresAtMs))
    && (conditions.batteryThresholdPercent===null || typeof conditions.batteryThresholdPercent === "number" && Number.isInteger(conditions.batteryThresholdPercent) && conditions.batteryThresholdPercent>=10 && conditions.batteryThresholdPercent<=90 && conditions.batteryThresholdPercent%5===0)
    && typeof conditions.stopOnLowPowerMode === "boolean" && typeof conditions.allowLowBatteryStart === "boolean";
}
function validPowerSnapshot(value: JsonValue): boolean {
  return record(value) && ["battery","external","unknown"].includes(String(value.source))
    && ["supported","unsupported","unknown","no_battery"].includes(String(value.battery))
    && ["supported","unsupported","unknown"].includes(String(value.low_power_mode_capability))
    && (value.battery_percent===null || typeof value.battery_percent === "number" && Number.isInteger(value.battery_percent) && value.battery_percent>=0 && value.battery_percent<=100)
    && (value.low_power_mode===null || typeof value.low_power_mode === "boolean");
}

export function registerPlugin(definition: ZeroPluginDefinition, transport?: PluginTransport): PluginRegistration {
  const lifetime = new AbortController();
  const subscriptions: Disposable[] = [];
  let disposed = false;
  let activated = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    globalThis.removeEventListener?.("pagehide", dispose);
    lifetime.abort();
    for (const subscription of subscriptions.splice(0).reverse()) {
      try { subscription.dispose(); } catch { /* One resource must not block other cleanup. */ }
    }
    if (activated) void Promise.resolve().then(() => definition.deactivate?.("shutdown")).catch(() => undefined);
  };
  globalThis.addEventListener?.("pagehide", dispose, {once:true});
  const ready = (async (): Promise<Result<Readonly<PluginContext>>> => {
    try {
      const connection = transport ?? transportFromHost();
      const session = await connection.ready();
      if (disposed) return failure("session.disposed");
      if (session.apiVersion !== "1.0.0" || session.sessionId !== connection.session.sessionId
        || session.generation !== connection.session.generation) return failure("session.binding");
      // Command registration is unavailable until the native dispatch protocol is enabled.
      if (definition.commands && Object.keys(definition.commands).length) return failure("api.unavailable");
      const context: PluginContext = { session: Object.freeze(session), signal: lifetime.signal, subscriptions,
        bridge: createZeroBridge(connection, lifetime.signal) };
      activated = true;
      await definition.activate(context);
      if (disposed) return failure("session.disposed");
      return { ok: true, value: context };
    } catch (error: unknown) {
      dispose();
      return failure("activation.failed", error instanceof Error ? error.message : "Plugin activation failed");
    }
  })();
  return { ready, dispose };
}


/** Diagnostics never grant access to host logs, paths or clipboard content. */
export function emitDiagnostic(bridge: ZeroBridge, input: import("./diagnostics.js").DiagnosticEmitInput): Promise<Result<null>> {
  return bridge.request("diagnostics.emit", input);
}

/** Executes one native-issued occurrence; calendar and retry policy stay in the package. */
export function registerBackground(
  handler: (event: Readonly<import("./contracts.js").BackgroundEventContext>, context: Readonly<PluginContext>) => import("./contracts.js").BackgroundCompleteInput | Promise<import("./contracts.js").BackgroundCompleteInput>,
  transport?: PluginTransport,
): PluginRegistration {
  const lifetime = new AbortController();
  const subscriptions: Disposable[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    globalThis.removeEventListener?.("pagehide", dispose);
    lifetime.abort();
    for (const subscription of subscriptions.splice(0).reverse()) {
      try { subscription.dispose(); } catch { /* Keep disposing owned resources. */ }
    }
  };
  globalThis.addEventListener?.("pagehide", dispose, {once:true});
  const ready = (async (): Promise<Result<Readonly<PluginContext>>> => {
    try {
      const connection = transport ?? transportFromHost();
      const session = await connection.ready();
      if (disposed) return failure("session.disposed");
      if (session.sessionId !== connection.session.sessionId || session.generation !== connection.session.generation || session.apiVersion !== "1.0.0") return failure("session.binding");
      const event = session.background;
      if (!event || !validBackgroundEvent(event)) return failure("session.kind");
      const context: PluginContext = {session: Object.freeze(session), signal: lifetime.signal, subscriptions, bridge: createZeroBridge(connection, lifetime.signal)};
      let completion: import("./contracts.js").BackgroundCompleteInput;
      try { completion = await handler(Object.freeze(event), context); }
      catch {
        if (!disposed) await context.bridge.background.complete({outcome:"failed",nextAtMs:null});
        return failure("background.failed");
      }
      if (disposed) return failure("session.disposed");
      const completed = await context.bridge.background.complete(completion);
      if (completed.ok === false) return completed;
      return {ok:true,value:context};
    } catch (error: unknown) { return hostFailure(error); }
    finally { dispose(); }
  })();
  return {ready, dispose};
}
function validBackgroundEvent(event: import("./contracts.js").BackgroundEventContext): boolean {
  return Object.keys(event).length === 6
    && Object.keys(event).every(key => ["taskId","eventId","occurrenceId","attempt","payload","scheduleGeneration"].includes(key))
    && typeof event.taskId === "string" && /^[A-Za-z0-9_.-]{1,128}$/.test(event.taskId) && event.taskId !== "." && event.taskId !== ".."
    && typeof event.eventId === "string" && /^[a-z][a-z0-9_.-]{0,127}$/.test(event.eventId) && event.eventId.split(/[._-]/).every(part => /^[a-z0-9]+$/.test(part))
    && typeof event.occurrenceId === "string" && /^[a-f0-9]{32}$/.test(event.occurrenceId)
    && Number.isInteger(event.attempt) && event.attempt >= 1 && event.attempt <= 32
    && Number.isSafeInteger(event.scheduleGeneration) && event.scheduleGeneration > 0
    && boundedBackgroundPayload(event.payload);
}
function boundedBackgroundPayload(value: unknown): value is JsonValue {
  function valid(value: unknown, remaining: number): boolean {
    if (value === null || typeof value === "string" || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value !== "object" || remaining === 0) return false;
    return Object.values(value).every(child => valid(child, remaining - 1));
  }
  try { return valid(value, 32) && new TextEncoder().encode(JSON.stringify(value)).length <= 16 * 1024; }
  catch { return false; }
}
