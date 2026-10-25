export type GlobalShortcutActionId = "snapCapture" | "snapOcr" | "launchPanel";
export type SnapShortcutActionId = Exclude<GlobalShortcutActionId, "launchPanel">;
export type GlobalShortcutRegistrationState = "active" | "disabled" | "unassigned" | "inactive" | "conflict" | "unsupported";

export interface GlobalShortcutSnapshot {
  id: GlobalShortcutActionId;
  pluginName: string;
  accelerator: string | null;
  defaultAccelerator: string | null;
  editable: boolean;
  enabled: boolean;
  registered: boolean;
  platformSupported: boolean;
  registrationState: GlobalShortcutRegistrationState;
  diagnosticCode: string | null;
}
export interface SetSnapShortcutInput {
  id: SnapShortcutActionId;
  accelerator: string | null;
}
export type ShortcutErrorCode = "invalid" | "duplicate" | "conflict" | "persistence" | "rollback" | "busy" | "readOnly" | "unsupported" | "invalidConfiguration";
export interface ShortcutError { code: ShortcutErrorCode }
export const GLOBAL_SHORTCUT_COMMANDS = {
  getSnapshots: "get_global_shortcut_snapshots",
  setSnapShortcut: "set_snap_shortcut",
} as const;
export type GlobalShortcutCommand = (typeof GLOBAL_SHORTCUT_COMMANDS)[keyof typeof GLOBAL_SHORTCUT_COMMANDS];
export type GlobalShortcutInvokeBridge = <T>(command: GlobalShortcutCommand, args?: { input: SetSnapShortcutInput }) => Promise<T>;
export function createGlobalShortcutService(invokeCommand: GlobalShortcutInvokeBridge) {
  return {
    getSnapshots: () => invokeCommand<GlobalShortcutSnapshot[]>(GLOBAL_SHORTCUT_COMMANDS.getSnapshots),
    setSnapShortcut: (input: SetSnapShortcutInput) => invokeCommand<GlobalShortcutSnapshot[]>(GLOBAL_SHORTCUT_COMMANDS.setSnapShortcut, { input }),
  };
}
export function shortcutStatusMessageKey(state: GlobalShortcutRegistrationState) {
  return `prefs.shortcuts.${state}` as const;
}
export function shortcutErrorMessageKey(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : "conflict";
  switch (code) {
    case "invalid": case "duplicate": case "persistence": case "rollback": case "busy": case "readOnly": case "unsupported": case "invalidConfiguration":
      return `prefs.shortcuts.error.${code}` as const;
    default: return "prefs.shortcuts.error.conflict" as const;
  }
}
export function displayShortcut(accelerator: string, macOS = false): string {
  return accelerator.split("+").map((part) => ({ Super: macOS ? "⌘" : "Win", CommandOrControl: macOS ? "⌘" : "Ctrl", Control: "Ctrl", Alt: macOS ? "⌥" : "Alt" }[part] ?? part.replace(/^Key|^Digit/, ""))).join(" + ");
}

type ShortcutKeyEvent = Pick<KeyboardEvent, "code" | "altKey" | "ctrlKey" | "shiftKey" | "metaKey">;
export function recordShortcut(event: ShortcutKeyEvent): { kind: "cancel" | "pending" } | { kind: "shortcut"; accelerator: string } {
  if (event.code === "Escape") return { kind: "cancel" };
  if (/^(Alt|Control|Shift|Meta)(Left|Right)$/.test(event.code) || !event.code) return { kind: "pending" };
  const modifiers = [event.ctrlKey && "Control", event.altKey && "Alt", event.shiftKey && "Shift", event.metaKey && "Super"].filter(Boolean);
  if (!modifiers.length) return { kind: "pending" };
  const key = event.code.replace(/^Key|^Digit/, "");
  return { kind: "shortcut", accelerator: [...modifiers, key].join("+") };
}
