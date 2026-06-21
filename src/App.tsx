import { useEffect, useState } from "react";
import "./App.css";
import { CaffeinePanel } from "./plugins/caffeine/CaffeinePanel";
import { AboutPanel } from "./plugins/preferences/AboutPanel";
import { PreferencesPanel } from "./plugins/preferences/PreferencesPanel";
import { createTranslator, resolveLanguage } from "./plugins/preferences/i18n";
import type { TranslationKey } from "./plugins/preferences/i18n";
import { usePreferences } from "./plugins/preferences/usePreferences";
import { ScreenshotPanel } from "./plugins/screenshot/ScreenshotPanel";
import { PluginId, PluginMeta } from "./plugins/types";
import { appWindows } from "./services/appWindows";

const plugins: PluginMeta[] = [
  {
    id: "screenshot",
    title: "Screenshot",
    subtitle: "Shortcut, copy, save",
    health: "active",
  },
  {
    id: "caffeine",
    title: "Caffeine",
    subtitle: "Keep awake",
    health: "ready",
  },
];

const pluginIds = plugins.map((plugin) => plugin.id);

type ShellMessage = {
  tone: "error" | "info";
  text: string;
};

function useLocalizedPlugins() {
  const preferences = usePreferences(pluginIds);
  const resolvedLanguage = resolveLanguage(
    preferences.preferences.language,
    navigator.language,
  );
  const t = createTranslator(resolvedLanguage);
  const localizedPlugins = plugins.map((plugin) => ({
    ...plugin,
    title: t(plugin.id === "screenshot" ? "plugin.screenshot.title" : "plugin.caffeine.title"),
    subtitle: t(
      plugin.id === "screenshot"
        ? "plugin.screenshot.subtitle"
        : "plugin.caffeine.subtitle",
    ),
  }));
  const visiblePlugins = localizedPlugins.filter((plugin) =>
    preferences.visiblePluginIds.includes(plugin.id),
  );

  return {
    preferences,
    t,
    localizedPlugins,
    visiblePlugins,
  };
}

function useSelectedPlugin(visiblePlugins: PluginMeta[]) {
  const [selectedPlugin, setSelectedPlugin] = useState<PluginId>("screenshot");
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
  if (plugin?.id === "caffeine") {
    return <CaffeinePanel t={t} />;
  }

  return <ScreenshotPanel t={t} />;
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
            `accent-${plugin.id}`,
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
  const { t, visiblePlugins } = useLocalizedPlugins();
  const { activePlugin, setSelectedPlugin } = useSelectedPlugin(visiblePlugins);
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
          {visiblePlugins.length}/{plugins.length} {t("app.pluginCount")}
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
  const { t, visiblePlugins } = useLocalizedPlugins();
  const { activePlugin, setSelectedPlugin } = useSelectedPlugin(visiblePlugins);
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
              {visiblePlugins.length}/{plugins.length} {t("app.pluginCount")}
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
  const { preferences, t, localizedPlugins } = useLocalizedPlugins();
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
    </main>
  );
}

export function AboutWindowApp() {
  const { t, localizedPlugins } = useLocalizedPlugins();

  return (
    <main className="app-shell standalone-shell about-window-shell">
      <header className="standalone-header" data-tauri-drag-region>
        <div>
          <h1>{t("about.title")}</h1>
          <p>{t("shell.aboutSubtitle")}</p>
        </div>
      </header>

      <AboutPanel plugins={localizedPlugins} t={t} />
    </main>
  );
}

export default TrayPanelApp;
