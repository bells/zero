import type {
  Disposable, JsonValue, PluginContext, PluginError, PluginMethod, PluginMethodMap,
  PluginRequest, PluginResponse, PluginSessionInfo, Result, ZeroBridge, ZeroPluginDefinition,
} from "../core/pluginHost/protocol/contracts";
export type * from "../core/pluginHost/protocol/contracts";

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
  return {
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
        timeout = setTimeout(() => { finish(failure("request.timeout")); cancelNative(); }, 10_000);
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
}
function validOutput(method: PluginMethod, value: JsonValue): boolean {
  if (method === "storage.get") return true;
  if (method === "network.fetch") return value !== null && typeof value === "object" && !Array.isArray(value)
    && typeof value.status === "number" && Number.isInteger(value.status)
    && (typeof value.contentType === "string" || value.contentType === null) && typeof value.bodyBase64 === "string";
  return value === null;
}

export function registerPlugin(definition: ZeroPluginDefinition, transport?: PluginTransport): PluginRegistration {
  const lifetime = new AbortController();
  const subscriptions: Disposable[] = [];
  let disposed = false;
  let activated = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    lifetime.abort();
    for (const subscription of subscriptions.splice(0).reverse()) {
      try { subscription.dispose(); } catch { /* One resource must not block other cleanup. */ }
    }
    if (activated) void Promise.resolve().then(() => definition.deactivate?.("shutdown")).catch(() => undefined);
  };
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
export function emitDiagnostic(bridge: ZeroBridge, input: import("../core/diagnostics/contracts").DiagnosticEmitInput): Promise<Result<null>> {
  return bridge.request("diagnostics.emit", input);
}
