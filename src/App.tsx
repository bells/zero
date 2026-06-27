import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { CaffeinePanel } from "./plugins/caffeine/CaffeinePanel";
import {
  bundledPluginKind,
  pluginAccentClass,
} from "./plugins/pluginHost/bundledPlugins";
import { PluginManagerPanel } from "./plugins/pluginHost/PluginManagerPanel";
import type { PluginRecord } from "./plugins/pluginHost/contracts";
import { usePluginHost } from "./plugins/pluginHost/usePluginHost";
import { AboutPanel } from "./plugins/preferences/AboutPanel";
import { PreferencesPanel } from "./plugins/preferences/PreferencesPanel";
import { createTranslator, resolveLanguage } from "./plugins/preferences/i18n";
import type { TranslationKey } from "./plugins/preferences/i18n";
import { usePreferences } from "./plugins/preferences/usePreferences";
import { ScreenshotPanel } from "./plugins/screenshot/ScreenshotPanel";
import { PluginId, PluginMeta } from "./plugins/types";
import { appWindows } from "./services/appWindows";

type ShellMessage = {
  tone: "error" | "info";
  text: string;
};

function useLocalizedPlugins() {
  const pluginHost = usePluginHost();
  const preferencePlugins = useMemo(
    () => pluginHost.records.map(pluginRecordToMeta),
    [pluginHost.records],
  );
  const navigationPlugins = useMemo(
    () =>
      pluginHost.navigationItems.map((item) => ({
        id: item.id,
        title: item.title,
        subtitle: item.subtitle,
        health: item.health,
        enabled: item.enabled,
      })),
    [pluginHost.navigationItems],
  );
  const pluginIds = useMemo(
    () => preferencePlugins.map((plugin) => plugin.id),
    [preferencePlugins],
  );
  const preferences = usePreferences(pluginIds);
  const resolvedLanguage = resolveLanguage(
    preferences.preferences.language,
    navigator.language,
  );
  const t = createTranslator(resolvedLanguage);
  const localizedPlugins = preferencePlugins.map((plugin) =>
    localizePluginMeta(plugin, t),
  );
  const visiblePlugins = navigationPlugins.map((plugin) =>
    localizePluginMeta(plugin, t),
  ).filter((plugin) =>
    preferences.visiblePluginIds.includes(plugin.id),
  );

  return {
    pluginHost,
    preferences,
    t,
    localizedPlugins,
    visiblePlugins,
    pluginSummary: pluginHost.summary,
    totalPluginCount: pluginHost.summary.total,
  };
}

function useSelectedPlugin(
  visiblePlugins: PluginMeta[],
  selectedPlugin: PluginId | null,
  setSelectedPlugin: (pluginId: PluginId | null) => void,
) {
  const activePlugin =
    visiblePlugins.find((plugin) => plugin.id === selectedPlugin) ?? visiblePlugins[0];

  useEffect(() => {
    if (activePlugin && activePlugin.id !== selectedPlugin) {
      setSelectedPlugin(activePlugin.id);
    }
  }, [activePlugin, selectedPlugin]);

  return {
    selectedPlugin,
    setSelectedPlugin,
    activePlugin,
  };
}

function pluginPanel(plugin: PluginMeta | undefined, t: (key: TranslationKey) => string) {
  if (!plugin) {
    return <EmptyPluginState t={t} />;
  }

  if (bundledPluginKind(plugin.id) === "caffeine") {
    return <CaffeinePanel t={t} />;
  }

  if (bundledPluginKind(plugin.id) === "screenshot") {
    return <ScreenshotPanel t={t} />;
  }

  return <GenericPluginPanel plugin={plugin} />;
}

interface PluginPickerProps {
  activePluginId: PluginId | undefined;
  ariaLabel: string;
  plugins: PluginMeta[];
  variant: "grid" | "rail";
  onSelect: (pluginId: PluginId) => void;
}

function PluginPicker({
  activePluginId,
  ariaLabel,
  plugins,
  variant,
  onSelect,
}: PluginPickerProps) {
  return (
    <section className={variant === "rail" ? "plugin-list plugin-rail" : "plugin-list"} aria-label={ariaLabel}>
      {plugins.map((plugin) => (
        <button
          type="button"
          className={[
            "plugin-card",
            pluginAccentClass(plugin.id),
            plugin.id === activePluginId ? "selected" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          key={plugin.id}
          onClick={() => onSelect(plugin.id)}
        >
          <span className={`plugin-health ${plugin.health}`} />
          <span>
            <strong>{plugin.title}</strong>
            <small>{plugin.subtitle}</small>
          </span>
        </button>
      ))}
    </section>
  );
}

function EmptyPluginState({ t }: { t: (key: TranslationKey) => string }) {
  return (
    <section className="plugin-panel system-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">{t("shell.pluginWorkspace")}</span>
          <h2>ZTool</h2>
        </div>
        <span className="status-pill">{t("app.tagline")}</span>
      </div>
      <div className="panel-copy">
        <strong>No enabled plugins</strong>
        <span>Install a plugin from the market or restore bundled defaults.</span>
      </div>
    </section>
  );
}

function GenericPluginPanel({ plugin }: { plugin: PluginMeta }) {
  return (
    <section className="plugin-panel system-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Extension</span>
          <h2>{plugin.title}</h2>
        </div>
        <span className={`status-pill ${plugin.health === "ready" ? "active" : ""}`}>
          {plugin.health}
        </span>
      </div>
      <div className="panel-copy">
        <strong>{plugin.subtitle}</strong>
        <span>Generic extension rendering will be isolated in the extension surface.</span>
      </div>
    </section>
  );
}

function pluginRecordToMeta(record: PluginRecord): PluginMeta {
  return {
    id: record.name,
    title: record.manifest.displayName ?? record.name,
    subtitle: record.manifest.description ?? `${record.source} · ${record.version}`,
    health: record.health,
    enabled: record.enabled,
  };
}

function localizePluginMeta(
  plugin: PluginMeta,
  t: (key: TranslationKey) => string,
): PluginMeta {
  const builtin = bundledPluginKind(plugin.id);
  if (builtin === "screenshot") {
    return {
      ...plugin,
      title: t("plugin.screenshot.title"),
      subtitle: t("plugin.screenshot.subtitle"),
    };
  }

  if (builtin === "caffeine") {
    return {
      ...plugin,
      title: t("plugin.caffeine.title"),
      subtitle: t("plugin.caffeine.subtitle"),
    };
  }

  return plugin;
}

async function runShellAction(
  action: () => Promise<void>,
  setMessage: (message: ShellMessage | null) => void,
  t: (key: TranslationKey) => string,
) {
  try {
    await action();
    setMessage(null);
  } catch (error) {
    setMessage({
      tone: "error",
      text: `${t("shell.actionError")}: ${String(error)}`,
    });
  }
}

export function TrayPanelApp() {
  const { pluginHost, t, visiblePlugins, totalPluginCount } = useLocalizedPlugins();
  const { activePlugin, setSelectedPlugin } = useSelectedPlugin(
    visiblePlugins,
    pluginHost.selectedPluginName,
    pluginHost.setSelectedPluginName,
  );
  const [message, setMessage] = useState<ShellMessage | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const runAction = (action: () => Promise<void>) =>
    runShellAction(action, setMessage, t).finally(() => setMoreOpen(false));

  return (
    <main className="app-shell tray-shell">
      <header className="app-header" data-tauri-drag-region>
        <div>
          <h1>ZTool</h1>
          <p>{t("app.tagline")}</p>
        </div>
        <span className="shell-badge">
          {visiblePlugins.length}/{totalPluginCount} {t("app.pluginCount")}
        </span>
      </header>

      <PluginPicker
        activePluginId={activePlugin?.id}
        ariaLabel={t("shell.plugins")}
        plugins={visiblePlugins}
        variant="grid"
        onSelect={setSelectedPlugin}
      />

      {pluginPanel(activePlugin, t)}

      {message ? <p className={`shell-message ${message.tone}`}>{message.text}</p> : null}

      <footer className="tray-actions" aria-label={t("shell.systemActions")}>
        <button
          type="button"
          className="tray-icon-action"
          title={t("nav.preferences")}
          onClick={() => runAction(appWindows.openPreferencesWindow)}
        >
          ⚙
        </button>
        <button
          type="button"
          className="tray-primary-action"
          onClick={() => runAction(appWindows.openMainWindow)}
        >
          {t("shell.openZtool")}
        </button>
        <button
          type="button"
          className="tray-icon-action"
          title={t("shell.more")}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
        >
          ⋯
        </button>

        {moreOpen ? (
          <div className="tray-more-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => runAction(appWindows.openAboutWindow)}
            >
              {t("shell.aboutZtool")}
            </button>
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={() => runAction(appWindows.quitApp)}
            >
              {t("shell.exitStatusBar")}
            </button>
          </div>
        ) : null}
      </footer>
    </main>
  );
}

export function MainWindowApp() {
  const { pluginHost, t, visiblePlugins, totalPluginCount } = useLocalizedPlugins();
  const { activePlugin, setSelectedPlugin } = useSelectedPlugin(
    visiblePlugins,
    pluginHost.selectedPluginName,
    pluginHost.setSelectedPluginName,
  );
  const [message, setMessage] = useState<ShellMessage | null>(null);
  const runAction = (action: () => Promise<void>) => runShellAction(action, setMessage, t);

  return (
    <main className="app-shell main-window-shell">
      <header className="main-window-header" data-tauri-drag-region>
        <div className="main-window-title">
          <span className="app-mark">Z</span>
          <div>
            <h1>{t("shell.mainTitle")}</h1>
            <p>{t("shell.mainSubtitle")}</p>
          </div>
        </div>
        <div className="main-window-actions" aria-label={t("shell.systemActions")}>
          <button type="button" className="secondary-action" onClick={() => runAction(appWindows.openPreferencesWindow)}>
            {t("nav.preferences")}
          </button>
          <button type="button" className="secondary-action" onClick={() => runAction(appWindows.openAboutWindow)}>
            {t("nav.about")}
          </button>
        </div>
      </header>

      {message ? <p className={`shell-message ${message.tone}`}>{message.text}</p> : null}

      <div className="main-window-layout">
        <aside className="main-sidebar">
          <div>
            <strong>{t("shell.plugins")}</strong>
            <span>
              {visiblePlugins.length}/{totalPluginCount} {t("app.pluginCount")}
            </span>
          </div>
          <PluginPicker
            activePluginId={activePlugin?.id}
            ariaLabel={t("shell.plugins")}
            plugins={visiblePlugins}
            variant="rail"
            onSelect={setSelectedPlugin}
          />
        </aside>

        <section className="main-workspace" aria-label={t("shell.pluginWorkspace")}>
          <div className="main-workspace-heading">
            <div>
              <span className="eyebrow">{t("shell.pluginWorkspace")}</span>
              <h2>{activePlugin?.title ?? "ZTool"}</h2>
            </div>
            <span className="status-pill active">{activePlugin?.subtitle ?? t("app.tagline")}</span>
          </div>
          {pluginPanel(activePlugin, t)}
        </section>
      </div>
    </main>
  );
}

export function PreferencesWindowApp() {
  const { pluginHost, preferences, t, localizedPlugins } = useLocalizedPlugins();
  const preferenceMessage = preferences.messageDetail
    ? `${t(preferences.messageKey)}: ${preferences.messageDetail}`
    : t(preferences.messageKey);

  return (
    <main className="app-shell standalone-shell preferences-window-shell">
      <header className="standalone-header" data-tauri-drag-region>
        <div>
          <h1>{t("prefs.title")}</h1>
          <p>{t("shell.preferencesSubtitle")}</p>
        </div>
      </header>

      <PreferencesPanel
        plugins={localizedPlugins}
        preferences={preferences.preferences}
        isAutostartBusy={preferences.isAutostartBusy}
        message={preferenceMessage}
        t={t}
        onLaunchAtLoginChange={preferences.setLaunchAtLogin}
        onLanguageChange={preferences.setLanguage}
        onToolVisibleChange={preferences.setToolVisible}
      />
      <PluginManagerPanel pluginHost={pluginHost} />
    </main>
  );
}

export function AboutWindowApp() {
  const { t, localizedPlugins, pluginSummary } = useLocalizedPlugins();

  return (
    <main className="app-shell standalone-shell about-window-shell">
      <header className="standalone-header" data-tauri-drag-region>
        <div>
          <h1>{t("about.title")}</h1>
          <p>{t("shell.aboutSubtitle")}</p>
        </div>
      </header>

      <AboutPanel plugins={localizedPlugins} summary={pluginSummary} t={t} />
    </main>
  );
}

export default TrayPanelApp;
