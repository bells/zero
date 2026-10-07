import { useState } from "react";
import { pluginHostService } from "./pluginHostService";

interface ExtensionSurfaceProps {
  title: string;
  pluginId: string;
  viewId: string;
  onLoadError: (message: string) => void;
}

export function ExtensionSurface({ title, pluginId, viewId, onLoadError }: ExtensionSurfaceProps) {
  const [opening, setOpening] = useState(false);
  const open = async () => {
    setOpening(true);
    try {
      await pluginHostService.openView({ pluginId, viewId });
    } catch (error: unknown) {
      const message = typeof error === "object" && error !== null && "message" in error
        ? String(error.message) : String(error);
      onLoadError(message);
    } finally {
      setOpening(false);
    }
  };
  return <button className="secondary-button" disabled={opening} onClick={() => void open()}>
    {opening ? "…" : title} ↗
  </button>;
}
