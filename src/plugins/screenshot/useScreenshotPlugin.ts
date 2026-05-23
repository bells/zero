import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type ScreenshotAction = "copy" | "save";

interface ScreenshotCapabilities {
  platform: string;
  wechat_visual: boolean;
  custom_overlay: boolean;
  system_launcher: boolean;
  active_actions: string[];
  pending_tools: string[];
}

interface ScreenshotStartResult {
  mode: string;
  action: ScreenshotAction;
  message: string;
}

const defaultCapabilities: ScreenshotCapabilities = {
  platform: "Unknown",
  wechat_visual: true,
  custom_overlay: false,
  system_launcher: false,
  active_actions: [],
  pending_tools: [],
};

export function useScreenshotPlugin() {
  const [capabilities, setCapabilities] =
    useState<ScreenshotCapabilities>(defaultCapabilities);
  const [message, setMessage] = useState("截图插件准备中");
  const [isBusy, setIsBusy] = useState(false);

  const refresh = useCallback(async () => {
    const next = await invoke<ScreenshotCapabilities>("get_screenshot_capabilities");
    setCapabilities(next);
    setMessage(
      next.wechat_visual
        ? "第一阶段已采用微信式截图界面，截取后端使用系统能力"
        : "当前平台先使用系统截图入口",
    );
  }, []);

  const start = useCallback(async (action: ScreenshotAction) => {
    setIsBusy(true);
    try {
      const result = await invoke<ScreenshotStartResult>("start_screenshot", { action });
      setMessage(result.message);
    } catch (err) {
      setMessage(`截图工具打开失败: ${String(err)}`);
    } finally {
      setIsBusy(false);
    }
  }, []);

  useEffect(() => {
    refresh().catch((err) => setMessage(`截图插件初始化失败: ${String(err)}`));
  }, [refresh]);

  return {
    capabilities,
    message,
    isBusy,
    start,
  };
}
