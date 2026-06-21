import { invoke } from "@tauri-apps/api/core";
import { createAppWindowService } from "./appWindowService";

export const appWindows = createAppWindowService((command) => invoke(command));
