import { invoke } from "@tauri-apps/api/core";
import {
  createGlobalShortcutService,
  type GlobalShortcutCommand,
} from "./globalShortcutServiceCore";

export {
  GLOBAL_SHORTCUT_COMMANDS,
  createGlobalShortcutService,
  shortcutStatusMessageKey,
  shortcutErrorMessageKey,
  displayShortcut,
  type SetSnapShortcutInput,
  type SnapShortcutActionId,
  type GlobalShortcutActionId,
  type GlobalShortcutCommand,
  type GlobalShortcutInvokeBridge,
  type GlobalShortcutRegistrationState,
  type GlobalShortcutSnapshot,
} from "./globalShortcutServiceCore";

export const globalShortcutService = createGlobalShortcutService(
  <T>(command: GlobalShortcutCommand, args?: { input: import("./globalShortcutServiceCore").SetSnapShortcutInput }) => invoke<T>(command, args),
);
