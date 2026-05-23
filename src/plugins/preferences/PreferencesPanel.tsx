import { PluginId, PluginMeta } from "../types";
import { AppPreferences, LanguagePreference } from "./preferencesModel";
import type { TranslationKey } from "./i18n";

interface PreferencesPanelProps {
  plugins: PluginMeta[];
  preferences: AppPreferences;
  isAutostartBusy: boolean;
  message: string;
  t: (key: TranslationKey) => string;
  onLaunchAtLoginChange: (enabled: boolean) => void;
  onLanguageChange: (language: LanguagePreference) => void;
  onToolVisibleChange: (pluginId: PluginId, visible: boolean) => void;
}

export function PreferencesPanel({
  plugins,
  preferences,
  isAutostartBusy,
  message,
  t,
  onLaunchAtLoginChange,
  onLanguageChange,
  onToolVisibleChange,
}: PreferencesPanelProps) {
  return (
    <section className="plugin-panel system-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">{t("prefs.eyebrow")}</span>
          <h2>{t("prefs.title")}</h2>
        </div>
        <span className="status-pill active">{t("prefs.saved")}</span>
      </div>

      <div className="settings-group">
        <label className="setting-row">
          <span>
            <strong>{t("prefs.launchAtLogin.title")}</strong>
            <small>{t("prefs.launchAtLogin.description")}</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={preferences.launchAtLogin}
            disabled={isAutostartBusy}
            onChange={(event) => onLaunchAtLoginChange(event.currentTarget.checked)}
          />
        </label>
      </div>

      <div className="settings-group">
        <label className="setting-row">
          <span>
            <strong>{t("prefs.language.title")}</strong>
            <small>{t("prefs.language.description")}</small>
          </span>
          <select
            className="language-select"
            value={preferences.language}
            onChange={(event) => onLanguageChange(event.currentTarget.value as LanguagePreference)}
          >
            <option value="system">{t("prefs.language.system")}</option>
            <option value="zh-CN">{t("prefs.language.zh")}</option>
            <option value="en-US">{t("prefs.language.en")}</option>
          </select>
        </label>
      </div>

      <div className="settings-group">
        <div className="settings-title">{t("prefs.tools.title")}</div>
        {plugins.map((plugin) => (
          <label className="setting-row compact" key={plugin.id}>
            <span>
              <strong>{plugin.title}</strong>
              <small>{plugin.subtitle}</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={preferences.visibleTools[plugin.id]}
              onChange={(event) => onToolVisibleChange(plugin.id, event.currentTarget.checked)}
            />
          </label>
        ))}
      </div>

      <p className="settings-message">{message}</p>
    </section>
  );
}
