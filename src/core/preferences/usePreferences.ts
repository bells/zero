import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
const isEnabled = () => invoke<boolean>("get_autostart");
const enable = () => invoke<void>("set_autostart", { enabled: true });
const disable = () => invoke<void>("set_autostart", { enabled: false });
import type { PluginId } from "../pluginHost/pluginTypes";
import { resolveLanguage, type TranslationKey } from "./i18n";
import {
  AppPreferences,
  LanguagePreference,
  getVisiblePluginIds,
  normalizePreferences,
  setLanguagePreference,
  setToolVisibility,
} from "./preferencesModel";
import {
  readStoredPreferences,
  writeCanonicalPreferences,
} from "./preferencesStorage";
import { updateLaunchAtLoginPreference } from "./preferencesActions";

export function usePreferences(pluginIds: PluginId[]) {
  const pluginIdsKey = pluginIds.join("\u0000");
  const [preferences, setPreferences] = useState<AppPreferences>(() =>
    normalizePreferences(readStoredPreferences(window.localStorage), pluginIds),
  );
  const [storageError, setStorageError] = useState<string | null>(null);
  const [isAutostartBusy, setIsAutostartBusy] = useState(false);
  const [messageKey, setMessageKey] = useState<TranslationKey>("prefs.message.ready");
  const [messageDetail, setMessageDetail] = useState<string | null>(null);

  useEffect(() => {
    void invoke<void>("set_status_bar_language", {
      language: resolveLanguage(preferences.language, navigator.language),
    }).catch((error: unknown) => setMessageDetail(String(error)));
  }, [preferences.language]);

  useEffect(() => {
    try {
      writeCanonicalPreferences(window.localStorage, preferences);
      setStorageError(null);
    } catch (error) {
      setStorageError(String(error));
    }
  }, [preferences]);

  useEffect(() => {
    setPreferences((current) => normalizePreferences(current, pluginIds));
  }, [pluginIdsKey]);

  useEffect(() => {
    isEnabled()
      .then((enabled) => {
        setPreferences((current) => ({
          ...current,
          launchAtLogin: enabled,
        }));
      })
      .catch((error) => {
        setMessageKey("prefs.message.autostartReadError");
        setMessageDetail(String(error));
      });
  }, []);

  useEffect(() => {
    const refresh = (event: StorageEvent) => {
      if (event.key === "zero.preferences.v1") {
        setPreferences(normalizePreferences(readStoredPreferences(window.localStorage), pluginIds));
      }
    };
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [pluginIdsKey]);

  const setMainSidebarCollapsed = useCallback((collapsed: boolean) => {
    setPreferences((current) => ({ ...current, mainSidebarCollapsed: collapsed }));
  }, []);

  const visiblePluginIds = useMemo(
    () => getVisiblePluginIds(pluginIds, preferences),
    [pluginIds, preferences],
  );

  const setLaunchAtLogin = useCallback(async (enabled: boolean) => {
    setIsAutostartBusy(true);
    try {
      const next = await updateLaunchAtLoginPreference(preferences, enabled, {
        enable,
        disable,
      });
      setPreferences(next);
      setMessageKey(enabled ? "prefs.message.autostartOn" : "prefs.message.autostartOff");
      setMessageDetail(null);
    } catch (error) {
      setMessageKey("prefs.message.autostartWriteError");
      setMessageDetail(String(error));
      throw error;
    } finally {
      setIsAutostartBusy(false);
    }
  }, [preferences]);

  const setToolVisible = useCallback(
    (pluginId: PluginId, visible: boolean) => {
      if (
        !visible &&
        preferences.visibleTools[pluginId] &&
        visiblePluginIds.length <= 1
      ) {
        return false;
      }
      setPreferences((current) => setToolVisibility(current, pluginId, visible, pluginIds));
      setMessageKey("prefs.message.toolsSaved");
      setMessageDetail(null);
      return true;
    },
    [pluginIds, preferences.visibleTools, visiblePluginIds.length],
  );

  const setLanguage = useCallback((language: LanguagePreference) => {
    setPreferences((current) => setLanguagePreference(current, language));
    setMessageKey("prefs.message.languageSaved");
    setMessageDetail(null);
  }, []);

  return {
    preferences,
    storageError,
    setMainSidebarCollapsed,
    visiblePluginIds,
    isAutostartBusy,
    messageKey,
    messageDetail,
    setLaunchAtLogin,
    setToolVisible,
    setLanguage,
  };
}
