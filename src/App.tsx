import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { CaffeinePanel } from "./plugins/caffeine/CaffeinePanel";
import { AboutPanel } from "./plugins/preferences/AboutPanel";
import { PreferencesPanel } from "./plugins/preferences/PreferencesPanel";
import { usePreferences } from "./plugins/preferences/usePreferences";
import { ScreenshotPanel } from "./plugins/screenshot/ScreenshotPanel";
import { PluginId, PluginMeta } from "./plugins/types";

type MainView = "tool" | "preferences" | "about";

const plugins: PluginMeta[] = [
  {
    id: "screenshot",
    title: "截图工具",
    subtitle: "选区、复制、保存",
    health: "active",
  },
  {
    id: "caffeine",
    title: "咖啡因模式",
    subtitle: "保持屏幕与系统唤醒",
    health: "ready",
  },
];

const pluginIds = plugins.map((plugin) => plugin.id);

function App() {
  const [selectedPlugin, setSelectedPlugin] = useState<PluginId>("screenshot");
  const [mainView, setMainView] = useState<MainView>("tool");
  const preferences = usePreferences(pluginIds);
  const visiblePlugins = plugins.filter((plugin) => preferences.visiblePluginIds.includes(plugin.id));
  const activePlugin = visiblePlugins.find((plugin) => plugin.id === selectedPlugin) ?? visiblePlugins[0];

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
          <p>Tray utilities, shaped as plugins</p>
        </div>
        <span className="shell-badge">
          {visiblePlugins.length}/{plugins.length} plugins
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
          plugins={plugins}
          preferences={preferences.preferences}
          isAutostartBusy={preferences.isAutostartBusy}
          message={preferences.message}
          onLaunchAtLoginChange={preferences.setLaunchAtLogin}
          onToolVisibleChange={preferences.setToolVisible}
        />
      ) : mainView === "about" ? (
        <AboutPanel plugins={plugins} />
      ) : activePlugin?.id === "caffeine" ? (
        <CaffeinePanel />
      ) : (
        <ScreenshotPanel />
      )}

      <footer className="system-strip" aria-label="系统功能">
        <button
          type="button"
          className={mainView === "preferences" ? "system-action selected" : "system-action"}
          onClick={() => setMainView("preferences")}
        >
          <span>S</span>
          偏好
        </button>
        <button
          type="button"
          className={mainView === "about" ? "system-action selected" : "system-action"}
          onClick={() => setMainView("about")}
        >
          <span>i</span>
          关于
        </button>
        <button type="button" className="system-action danger" onClick={quitApp}>
          <span>Q</span>
          退出
        </button>
      </footer>
    </main>
  );
}

export default App;
