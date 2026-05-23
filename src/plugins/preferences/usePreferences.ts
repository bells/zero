import { useCallback, useEffect, useMemo, useState } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { PluginId } from "../types";
import {
  AppPreferences,
  DEFAULT_PREFERENCES,
  getVisiblePluginIds,
  normalizePreferences,
  setToolVisibility,
} from "./preferencesModel";

const STORAGE_KEY = "ztool.preferences.v1";

export function usePreferences(pluginIds: PluginId[]) {
  const [preferences, setPreferences] = useState<AppPreferences>(() =>
    normalizePreferences(readStoredPreferences(), pluginIds),
  );
  const [isAutostartBusy, setIsAutostartBusy] = useState(false);
  const [message, setMessage] = useState("偏好设置已准备好");

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    isEnabled()
      .then((enabled) => {
        setPreferences((current) => ({
          ...current,
          launchAtLogin: enabled,
        }));
      })
      .catch((error) => {
        setMessage(`读取登录启动状态失败: ${String(error)}`);
      });
  }, []);

  const visiblePluginIds = useMemo(
    () => getVisiblePluginIds(pluginIds, preferences),
    [pluginIds, preferences],
  );

  const setLaunchAtLogin = useCallback(async (enabled: boolean) => {
    setIsAutostartBusy(true);
    try {
      if (enabled) {
        await enable();
      } else {
        await disable();
      }
      setPreferences((current) => ({
        ...current,
        launchAtLogin: enabled,
      }));
      setMessage(enabled ? "已设置为登录时打开" : "已关闭登录时打开");
    } catch (error) {
      setMessage(`设置登录启动失败: ${String(error)}`);
    } finally {
      setIsAutostartBusy(false);
    }
  }, []);

  const setToolVisible = useCallback(
    (pluginId: PluginId, visible: boolean) => {
      setPreferences((current) => setToolVisibility(current, pluginId, visible, pluginIds));
      setMessage("工具展示偏好已保存");
    },
    [pluginIds],
  );

  return {
    preferences,
    visiblePluginIds,
    isAutostartBusy,
    message,
    setLaunchAtLogin,
    setToolVisible,
  };
}

function readStoredPreferences() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}
