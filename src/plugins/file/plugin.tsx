import metadata from "./metadata.json";
import type { BundledPluginModule } from "../../core/pluginHost/pluginModule";
import { filePresentation } from "./presentation";

export const filePlugin: BundledPluginModule = {
  kind: "file",
  navigationIcon: "file",
  accentClass: "accent-file",
  manifest: metadata as BundledPluginModule["manifest"],
  presentation: filePresentation,
  loadPanel: () => import("./FilePanelEntry"),
};
