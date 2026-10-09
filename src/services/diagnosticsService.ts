import { invoke } from "@tauri-apps/api/core";
import { createDiagnosticsService } from "./diagnosticsServiceCore";
export const diagnosticsService = createDiagnosticsService((command, args) => invoke(command, args ? { ...args } : undefined));
