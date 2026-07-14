import { invoke } from "@tauri-apps/api/core";
import type { InvokeArgs } from "@tauri-apps/api/core";
import {
  createStatusBarService,
  type StatusBarCommand,
} from "./statusBarService";

export const statusBarService = createStatusBarService(
  <T>(command: StatusBarCommand, payload?: InvokeArgs) => invoke<T>(command, payload),
);
