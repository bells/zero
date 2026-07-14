import type { InvokeArgs } from "@tauri-apps/api/core";
import type {
  StatusBarItemSnapshot,
  StatusBarSettingsSnapshot,
  UpdateStatusBarSettingsInput,
} from "./statusBarModel";

export const STATUS_BAR_COMMANDS = {
  getSettings: "get_status_bar_settings",
  updateSettings: "update_status_bar_settings",
  getItems: "get_status_bar_items",
  runItemAction: "run_status_bar_item_action",
} as const;

export interface RunStatusBarItemActionInput {
  itemId: string;
}

export type StatusBarCommand = (typeof STATUS_BAR_COMMANDS)[keyof typeof STATUS_BAR_COMMANDS];
type InvokeBridge = <T>(command: StatusBarCommand, payload?: InvokeArgs) => Promise<T>;

export function createStatusBarService(invokeCommand: InvokeBridge) {
  return {
    getSettings: () =>
      invokeCommand<StatusBarSettingsSnapshot>(STATUS_BAR_COMMANDS.getSettings),
    updateSettings: (input: UpdateStatusBarSettingsInput) =>
      invokeCommand<StatusBarSettingsSnapshot>(STATUS_BAR_COMMANDS.updateSettings, {
        input,
      }),
    getItems: () =>
      invokeCommand<StatusBarItemSnapshot[]>(STATUS_BAR_COMMANDS.getItems),
    runItemAction: (input: RunStatusBarItemActionInput) =>
      invokeCommand<void>(STATUS_BAR_COMMANDS.runItemAction, { input }),
  };
}
