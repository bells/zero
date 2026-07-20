import { invoke } from "@tauri-apps/api/core";
import {
  createQuickLauncherService,
  type QuickLauncherCommand,
  type QuickLauncherInvokeArgs,
} from "./quickLauncherServiceCore";

export * from "./quickLauncherServiceCore";

export const quickLauncherService = createQuickLauncherService(
  <T>(command: QuickLauncherCommand, args?: QuickLauncherInvokeArgs) =>
    invoke<T>(command, args),
);
