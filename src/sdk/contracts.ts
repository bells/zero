import type { DiagnosticEmitInput } from "./diagnostics.js";
/** Public protocol data contracts; runtime support is negotiated separately. */
export type SemVer = string;
export type SemVerRange = string;
export type PluginId = string;
export type PackagePath = string;
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type Platform = "macos" | "windows" | "linux";
export type PublicPermission = "storage.plugin" | "ui.message" | "network" | "diagnostics.write" | "power.preventSleep" | "background.schedule" | "system.wallpaper" | "files.export" | "system.apps.read" | "system.apps.execute" | "system.window.focus" | "screen.capture" | "documents.convert";
export type InternalPermission = PublicPermission | "clipboard.read" | "clipboard.write"
  | "process.execute" | "system.apps.read" | "system.apps.execute"
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
export interface RequiredCapability { id: string; version: SemVerRange }
export interface HostCapability { id: string; version: SemVer }
export interface CapabilityReport {
  compatible: boolean;
  capabilities: HostCapability[];
  issues: CompatibilityIssue[];
}
export interface PluginBackground { main: PackagePath; events: string[] }
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
  requiredCapabilities?: RequiredCapability[];
  background?: PluginBackground;
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
    | "platform.unsupported" | "runtime.unsupported" | "permission.unsupported"
    | "capability.missing" | "capability.incompatible" | "capability.invalid";
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
export interface BackgroundEventContext {
  taskId: string; eventId: string; occurrenceId: string; attempt: number;
  payload: JsonValue; scheduleGeneration: number;
}
export interface ScheduleUpsertInput { taskId: string; eventId: string; nextAtMs: number; payload: JsonValue }
export interface ScheduleCancelInput { taskId: string }
export interface ScheduleUpsertOutput { generation: number }
export interface ScheduleCancelOutput { cancelled: boolean }
export interface BackgroundCompleteInput { outcome: "completed" | "retry" | "failed"; nextAtMs: number | null }
export interface BackgroundCompleteOutput { generation: number | null }
export interface PluginSessionInfo extends SessionBinding {
  pluginId: PluginId;
  pluginVersion: SemVer;
  apiVersion: SemVer;
  surfaceId: string;
  registryRevision: number;
  background?: BackgroundEventContext;
}
export interface PluginError {
  code: string;
  message: string;
  retryable: boolean;
}
export type Result<T> = { ok: true; value: T } | { ok: false; error: PluginError };
export interface PowerLeaseInfo {
  leaseId: string;
  generation: number;
  expiresAtMs: number | null;
}
export interface PowerLeaseStatus { leases: PowerLeaseInfo[] }
export type PowerTaskSchedule = {kind:"unlimited"} | {kind:"duration";minutes:number} | {kind:"until";expiresAtMs:number};
export interface PowerTaskConditions { batteryThresholdPercent:number|null;stopOnLowPowerMode:boolean;allowLowBatteryStart:boolean }
export interface PowerSnapshot {
  source:"battery"|"external"|"unknown";
  battery:"supported"|"unsupported"|"no_battery"|"unknown";
  battery_percent:number|null;
  low_power_mode_capability:"supported"|"unsupported"|"unknown";
  low_power_mode:boolean|null;
}
export interface PowerTaskStatus {
  generation:number;conditionsRevision:number;active:boolean;schedule:PowerTaskSchedule;conditions:PowerTaskConditions;
  startedAtMs:number;expiresAtMs:number|null;elapsedMs:number;remainingMs:number|null;
  batteryThresholdOverridden:boolean;protectionUnavailable:boolean;lastStopReason:string|null;
}
export interface ImageAsset { assetId:string; byteLength:number; width:number; height:number; mimeType:"image/jpeg"|"image/png" }
export interface ImagePreview {
  leaseId: string;
  /** Root-relative URL issued by the host for this WebView's preview lease. */
  url: string;
  byteLength: number;
  width: number;
  height: number;
  mimeType: "image/jpeg";
}
export interface WallpaperPlatform { platform:string; supported:boolean; detail?:string }
export interface WallpaperIntent { intentId:string; generation:number }
export interface ImageExport { cancelled:boolean; fileName:string|null }
export interface ApplicationCatalog {
  catalogId: string;
  itemCount: number;
}
export interface CatalogApplication {
  id: string;
  title: string;
  wordInitials: string;
  pinyin: string;
  pinyinInitials: string;
}
export interface ApplicationPage {
  items: CatalogApplication[];
  nextOffset: number | null;
}
export type ApplicationActivation = "focused" | "launched";
export interface ScreenCapture {
  captureId: string;
  width: number;
  height: number;
  url: string;
}
export type CaptureExportAction = "copy" | "save";
export interface CaptureExportLease { leaseId: string; maxBytes: number }
export interface CaptureExportResult { cancelled: boolean }

export type DocumentDirection = "pdfToDocx" | "docxToPdf";
export type DocumentJobStatus = "preparing" | "running" | "cancelling" | "completed" | "failed" | "cancelled";
export type DocumentJobStage = "validating" | "waitingForProvider" | "converting" | "finalizing";
export interface DocumentInput {
  id: string;
  fileName: string;
  direction: DocumentDirection;
  sizeBytes: number;
}
export interface DocumentJob {
  id: string;
  status: DocumentJobStatus;
  stage: DocumentJobStage | null;
  percent: number | null;
  outputName: string;
  errorCode: string | null;
}

export interface PluginMethodMap {
  "screen.captureDisplay": {input:Record<string, never>;output:ScreenCapture};
  "screen.releaseCapture": {input:{captureId:string};output:null};
  "screen.setCapturePinned": {input:{captureId:string;pinned:boolean};output:null};
  "screen.prepareCaptureExport": {input:{captureId:string;action:CaptureExportAction};output:CaptureExportLease};
  "screen.commitCaptureExport": {input:{leaseId:string};output:CaptureExportResult};
  "documents.chooseInput": {input:Record<string, never>;output:DocumentInput|null};
  "documents.start": {input:{id:string};output:DocumentJob|null};
  "documents.status": {input:{id:string};output:DocumentJob};
  "documents.cancel": {input:{id:string};output:null};
  "documents.reveal": {input:{id:string};output:null};
  "screen.openSystemCapture": {input:Record<string, never>;output:null};
  "apps.scan": {input:Record<string, never>;output:ApplicationCatalog};
  "apps.page": {input:{catalogId:string;offset:number};output:ApplicationPage};
  "apps.activate": {input:{catalogId:string;itemId:string};output:ApplicationActivation};
  "media.cacheImage": {input:{url:string};output:ImageAsset};
  "media.preview": {input:{assetId:string};output:ImagePreview};
  "media.releasePreview": {input:{leaseId:string};output:null};
  "media.exportImage": {input:{assetId:string;suggestedName:string};output:ImageExport};
  "wallpaper.platform": {input:Record<string,never>;output:WallpaperPlatform};
  "wallpaper.prepare": {input:{assetId:string;claimId:string};output:WallpaperIntent};
  "wallpaper.apply": {input:{intentId:string};output:{outcome:"applied"|"alreadyApplied"}};
  "wallpaper.cancelPrepared": {input:{intentId:string};output:null};
  "wallpaper.recover": {input:Record<string,never>;output:null};
  "schedule.upsert": { input: ScheduleUpsertInput; output: ScheduleUpsertOutput };
  "schedule.cancel": { input: ScheduleCancelInput; output: ScheduleCancelOutput };
  "background.complete": { input: BackgroundCompleteInput; output: BackgroundCompleteOutput };
  "power.startTask": {input:{expectedGeneration:number|null;expectedConditionsRevision:number|null;schedule:PowerTaskSchedule;conditions:PowerTaskConditions};output:PowerTaskStatus};
  "power.taskStatus": {input:Record<string,never>;output:PowerTaskStatus|null};
  "power.stopTask": {input:{generation:number};output:null};
  "power.updateTaskConditions": {input:{generation:number;expectedConditionsRevision:number;conditions:PowerTaskConditions};output:PowerTaskStatus};
  "power.readSnapshot": {input:Record<string,never>;output:PowerSnapshot};
  "power.acquire": { input: { durationMinutes: number | null }; output: PowerLeaseInfo };
  "power.release": { input: { leaseId: string; generation: number }; output: null };
  "power.status": { input: Record<string, never>; output: PowerLeaseStatus };

  "diagnostics.emit": { input: DiagnosticEmitInput; output: null };
  "ui.showMessage": { input: { message: string }; output: null };
  "storage.get": { input: { key: string }; output: JsonValue };
  "storage.compareAndSet": {input:{key:string;expectedValue:JsonValue;value:JsonValue};output:{swapped:boolean;currentValue:JsonValue}};
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
  reason: "installed" | "updated" | "enabled" | "disabled" | "removed" | "failed" | "changed" | "restored";
}

export interface Disposable { dispose(): void }
export interface PluginContext {
  session: Readonly<PluginSessionInfo>;
  signal: AbortSignal;
  subscriptions: Disposable[];
  bridge: ZeroBridge;
}
export interface ZeroBridge {
  upload(leaseId: string, bytes: Uint8Array, options?: { signal?: AbortSignal }): Promise<Result<CaptureExportResult>>;
  schedule: {
    upsert(input: ScheduleUpsertInput): Promise<Result<ScheduleUpsertOutput>>;
    cancel(input: ScheduleCancelInput): Promise<Result<ScheduleCancelOutput>>;
  };
  background: { complete(input: BackgroundCompleteInput): Promise<Result<BackgroundCompleteOutput>> };
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

export interface OpenPluginViewInput { pluginId: string; viewId: string }
