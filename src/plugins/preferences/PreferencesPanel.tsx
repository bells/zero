import { PluginId, PluginMeta } from "../types";
import { AppPreferences } from "./preferencesModel";

interface PreferencesPanelProps {
  plugins: PluginMeta[];
  preferences: AppPreferences;
  isAutostartBusy: boolean;
  message: string;
  onLaunchAtLoginChange: (enabled: boolean) => void;
  onToolVisibleChange: (pluginId: PluginId, visible: boolean) => void;
}

export function PreferencesPanel({
  plugins,
  preferences,
  isAutostartBusy,
  message,
  onLaunchAtLoginChange,
  onToolVisibleChange,
}: PreferencesPanelProps) {
  return (
    <section className="plugin-panel system-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Preferences</span>
          <h2>偏好设置</h2>
        </div>
        <span className="status-pill active">Saved</span>
      </div>

      <div className="settings-group">
        <label className="setting-row">
          <span>
            <strong>登录时打开</strong>
            <small>开机登录后自动启动 ZTool</small>
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
        <div className="settings-title">工具展示</div>
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
