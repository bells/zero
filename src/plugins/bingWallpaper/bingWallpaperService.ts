import { invoke } from "@tauri-apps/api/core";
import {
  createBingWallpaperService,
  type BingWallpaperCommand,
  type BingWallpaperInvokeArgs,
} from "./bingWallpaperServiceCore";

export { createBingWallpaperService } from "./bingWallpaperServiceCore";

export const bingWallpaperService = createBingWallpaperService(
  <T>(command: BingWallpaperCommand, args?: BingWallpaperInvokeArgs) =>
    invoke<T>(command, args),
);
