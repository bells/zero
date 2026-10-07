/** Design-only contract. Not imported by the application or published as an SDK. */
export type SemVer = string;
export type SemVerRange = string;
export type PluginId = string;
export type PackagePath = string;
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type Platform = "macos" | "windows" | "linux";
export type PublicPermission = "storage.plugin" | "ui.message" | "network";
export type InternalPermission = PublicPermission | "clipboard.read" | "clipboard.write"
  | "process.execute" | "system.wallpaper" | "system.apps.read" | "system.apps.execute"
  | "system.window.focus" | "system.settings.open" | "document.convert";

export interface PluginEnginesV2 {
  zero: SemVerRange;
  api: SemVerRange;
}
export interface PluginViewContribution {
  id: string;
  title: string;
  surface: "main" | "tray";
}
export interface PluginCommandContribution {
  id: string;
  title: string;
  viewId: string;
}
export interface PluginKeybindingContribution {
  command: string;
  default: string;
  description: string;
}
export interface PluginStatusBarContribution {
  id: string;
  title: string;
  command: string;
  icon: "extension";
  visibleByDefault: boolean;
}
export type PluginSettingContribution =
  | { key: string; type: "boolean"; default: boolean; label: string }
  | { key: string; type: "string"; default: string; label: string }
  | { key: string; type: "number"; default: number; label: string };
export interface PluginContributionsV2 {
  views: PluginViewContribution[];
  commands?: PluginCommandContribution[];
  keybindings?: PluginKeybindingContribution[];
  statusBarItems?: PluginStatusBarContribution[];
  settings?: PluginSettingContribution[];
}
export type ActivationEvent = `onView:${string}` | `onCommand:${string}`;
export interface PluginManifestV2 {
  schemaVersion: 2;
  name: PluginId;
  id: PluginId;
  displayName: string;
  description: string;
  author: string;
  version: SemVer;
  engines: PluginEnginesV2;
  platforms: Platform[];
  runtime: "webview";
  main: PackagePath;
  permissions: PublicPermission[];
  network?: { allowedOrigins: string[] };
  contributes: PluginContributionsV2;
  activationEvents: ActivationEvent[];
}

/** Internal build metadata; never accepted as a claim of trust from an archive. */
export interface BundledPluginMetadataV2 extends Omit<PluginManifestV2,
  "runtime" | "main" | "permissions" | "contributes" | "activationEvents"> {
  runtime: "bundled";
  moduleId: string;
  permissions: InternalPermission[];
  contributes: Omit<PluginContributionsV2, "statusBarItems"> & {
    statusBarItems?: Array<Omit<PluginStatusBarContribution, "icon"> & { icon: string }>;
  };
  activationEvents: ActivationEvent[];
}

export interface CompatibilityIssue {
  code: "manifest.invalid" | "schema.unsupported" | "host.incompatible" | "api.incompatible"
    | "platform.unsupported" | "runtime.unsupported" | "permission.unsupported";
  path: string;
  message: string;
  required: string | null;
  actual: string | null;
}
export interface CompatibilityReport {
  compatible: boolean;
  profile: "legacy" | "web-v1" | "bundled";
  hostVersion: SemVer;
  apiVersion: SemVer | null;
  issues: CompatibilityIssue[];
}
export interface CheckPluginCompatibilityInput { manifest: JsonValue }
export interface SessionBinding {
  sessionId: string;
  generation: number;
}
export interface PluginSessionInfo extends SessionBinding {
  pluginId: PluginId;
  pluginVersion: SemVer;
  apiVersion: SemVer;
  surfaceId: string;
  registryRevision: number;
}
export interface PluginError {
  code: string;
  message: string;
  retryable: boolean;
}
export type Result<T> = { ok: true; value: T } | { ok: false; error: PluginError };
export interface PluginMethodMap {
  "ui.showMessage": { input: { message: string }; output: null };
  "storage.get": { input: { key: string }; output: JsonValue };
  "storage.set": { input: { key: string; value: JsonValue }; output: null };
  "network.fetch": {
    input: { url: string; method: "GET" };
    output: { status: number; contentType: string | null; bodyBase64: string };
  };
}
export type PluginMethod = keyof PluginMethodMap;
export type PluginRequest = {
  [M in PluginMethod]: SessionBinding & {
    protocolVersion: "1.0.0";
    requestId: string;
    method: M;
    payload: PluginMethodMap[M]["input"];
  }
}[PluginMethod];
export interface PluginInvokeInput { request: PluginRequest }
export type PluginResponse = { requestId: string } & Result<JsonValue>;
export interface PluginRegistryChanged {
  revision: number;
  pluginIds: PluginId[];
  reason: "installed" | "updated" | "enabled" | "disabled" | "removed" | "failed";
}
export interface Disposable { dispose(): void }
export interface PluginContext {
  session: Readonly<PluginSessionInfo>;
  signal: AbortSignal;
  subscriptions: Disposable[];
  bridge: ZeroBridge;
}
export interface ZeroBridge {
  request<M extends PluginMethod>(
    method: M,
    payload: PluginMethodMap[M]["input"],
    options?: { signal?: AbortSignal },
  ): Promise<Result<PluginMethodMap[M]["output"]>>;
}
export interface ZeroPluginDefinition {
  activate(context: PluginContext): void | Promise<void>;
  deactivate?(reason: "hidden" | "disabled" | "updated" | "uninstalled" | "shutdown"):
    void | Promise<void>;
  commands?: Record<string, (payload: JsonValue, context: PluginContext) => Promise<Result<JsonValue>>>;
}
/** Registration within this isolated session, never registration of native host privileges. */
export declare function registerPlugin(definition: ZeroPluginDefinition): Disposable;
/** Optional React adapter; kept out of the framework-independent SDK entry. */
export declare function useZeroPlugin(): Readonly<PluginContext>;
