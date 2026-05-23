import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { CaffeinePanel } from "./plugins/caffeine/CaffeinePanel";
import { AboutPanel } from "./plugins/preferences/AboutPanel";
import { PreferencesPanel } from "./plugins/preferences/PreferencesPanel";
import { createTranslator, resolveLanguage } from "./plugins/preferences/i18n";
import { usePreferences } from "./plugins/preferences/usePreferences";
import { ScreenshotPanel } from "./plugins/screenshot/ScreenshotPanel";
import { PluginId, PluginMeta } from "./plugins/types";

type MainView = "tool" | "preferences" | "about";

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

function App() {
  const [selectedPlugin, setSelectedPlugin] = useState<PluginId>("screenshot");
  const [mainView, setMainView] = useState<MainView>("tool");
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
  const activePlugin = visiblePlugins.find((plugin) => plugin.id === selectedPlugin) ?? visiblePlugins[0];
  const preferenceMessage = preferences.messageDetail
    ? `${t(preferences.messageKey)}: ${preferences.messageDetail}`
    : t(preferences.messageKey);

  useEffect(() => {
    if (activePlugin && activePlugin.id !== selectedPlugin) {
      setSelectedPlugin(activePlugin.id);
    }
  }, [activePlugin, selectedPlugin]);

  const quitApp = () => {
    invoke("quit_app").catch(() => undefined);
  };

  return (
    <main className="app-shell">
      <header className="app-header" data-tauri-drag-region>
        <div>
          <h1>ZTool</h1>
          <p>{t("app.tagline")}</p>
        </div>
        <span className="shell-badge">
          {visiblePlugins.length}/{plugins.length} {t("app.pluginCount")}
        </span>
      </header>

      <section className="plugin-list" aria-label="工具插件">
        {visiblePlugins.map((plugin) => (
          <button
            type="button"
            className={[
              "plugin-card",
              `accent-${plugin.id}`,
              plugin.id === activePlugin.id ? "selected" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            key={plugin.id}
            onClick={() => {
              setSelectedPlugin(plugin.id);
              setMainView("tool");
            }}
          >
            <span className={`plugin-health ${plugin.health}`} />
            <span>
              <strong>{plugin.title}</strong>
              <small>{plugin.subtitle}</small>
            </span>
          </button>
        ))}
      </section>

      {mainView === "preferences" ? (
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
      ) : mainView === "about" ? (
        <AboutPanel plugins={localizedPlugins} t={t} />
      ) : activePlugin?.id === "caffeine" ? (
        <CaffeinePanel t={t} />
      ) : (
        <ScreenshotPanel t={t} />
      )}

      <footer className="system-strip" aria-label="系统功能">
        <button
          type="button"
          className={mainView === "preferences" ? "system-action selected" : "system-action"}
          onClick={() => setMainView("preferences")}
        >
          <span>S</span>
          {t("nav.preferences")}
        </button>
        <button
          type="button"
          className={mainView === "about" ? "system-action selected" : "system-action"}
          onClick={() => setMainView("about")}
        >
          <span>i</span>
          {t("nav.about")}
        </button>
        <button type="button" className="system-action danger" onClick={quitApp}>
          <span>Q</span>
          {t("nav.quit")}
        </button>
      </footer>
    </main>
  );
}

export default App;
