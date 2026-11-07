import type { BundledPluginPanelProps } from "../../core/pluginHost/pluginModule";
import { FilePanel } from "./FilePanel";
import { createFileTranslator } from "./i18n";

export default function FilePanelEntry({ language, surface }: BundledPluginPanelProps) {
  return <FilePanel surface={surface} t={createFileTranslator(language)} />;
}
