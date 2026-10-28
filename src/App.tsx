import { useEffect, useMemo, useState, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import "./App.css";
import "./appShell/navigation.css";
import "./appShell/mainSettings.css";
import {
  bundledPluginPresentation,
  bundledPluginModule,
  BUNDLED_PLUGIN_MODULES,
} from "./appShell/bundledPluginModules";
import { BundledPluginSettings } from "./appShell/BundledPluginSettings";
import { LazyPluginPanel } from "./appShell/LazyPluginPanel";
import { ArrowLeft, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { PluginNavigation } from "./appShell/PluginNavigation";
import { useCompactSidebar } from "./appShell/useCompactSidebar";
import { useMainNavigation } from "./appShell/useMainNavigation";
import { PresentationActivity } from "./core/windowing/PresentationActivity";
import { PRODUCT_NAME } from "./brand/identity";
import { StatusBarGlyph } from "./components/StatusBarGlyph";
import { ExtensionSurface } from "./core/pluginHost/ExtensionSurface";
import type { PluginRecord } from "./core/pluginHost/contracts";
import type { PluginId, PluginMeta } from "./core/pluginHost/pluginTypes";
import { usePluginHost } from "./core/pluginHost/usePluginHost";
import { AboutPanel } from "./core/preferences/AboutPanel";
import { PreferencesSettingsCenter } from "./core/preferences/PreferencesSettingsCenter";
import { createTranslator, resolveLanguage } from "./core/preferences/i18n";
import type {
  ResolvedLanguage,
  TranslationKey,
} from "./core/preferences/i18n";
import { usePreferences } from "./core/preferences/usePreferences";
import { appWindows } from "./services/appWindows";
import type { StatusBarItemSnapshot } from "./services/statusBarModel";
import { useStatusBar } from "./services/useStatusBar";

type ShellMessage = {
  tone: "error" | "info";
  text: string;
};

function usePluginMessages(setMessage: (message: ShellMessage) => void) {
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void listen<{ pluginId: string; message: string }>("plugin-ui-message", ({ payload }) => {
      if (!disposed) setMessage({ tone: "info", text: `${payload.pluginId}: ${payload.message}` });
    }).then(unlisten => { if (disposed) unlisten(); else cleanup = unlisten; }).catch(() => undefined);
    return () => { disposed = true; cleanup?.(); };
  }, [setMessage]);
}

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
    localizePluginMeta(plugin, resolvedLanguage),
  );
  const visiblePlugins = navigationPlugins.map((plugin) =>
    localizePluginMeta(plugin, resolvedLanguage),
  ).filter((plugin) =>
    preferences.visiblePluginIds.includes(plugin.id),
  );

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    listen<string>("status-bar-open-plugin", (event) => {
      pluginHost.setSelectedPluginName(event.payload);
    })
      .then((unsubscribe) => {
        if (cancelled) {
          unsubscribe();
        } else {
          unlisten = unsubscribe;
        }
      })
      .catch(() => {
        // The native event bridge is best-effort; direct plugin navigation still works.
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [pluginHost.setSelectedPluginName]);

  return {
    pluginHost,
    preferences,
    t,
    resolvedLanguage,
    localizedPlugins,
    visiblePlugins,
    pluginSummary: pluginHost.summary,
    totalPluginCount: pluginHost.summary.total,
  };
}

interface StatusBarFallbackRowProps {
  disabled: boolean;
  items: StatusBarItemSnapshot[];
  t: (key: TranslationKey) => string;
  onRunItem: (itemId: string) => void;
}

function StatusBarFallbackRow({
  disabled,
  items,
  t,
  onRunItem,
}: StatusBarFallbackRowProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="status-bar-fallback-row" aria-label={t("statusBar.fallback.title")}>
      <div>
        <strong>{t("statusBar.fallback.title")}</strong>
        <small>{t("statusBar.fallback.description")}</small>
      </div>
      <div className="status-bar-fallback-actions">
        {items.map((item) => (
          <button
            type="button"
            className="status-bar-fallback-action"
            key={item.id}
            title={item.title}
            disabled={disabled}
            onClick={() => onRunItem(item.id)}
          >
            <StatusBarGlyph icon={item.icon} />
            <span>{item.title}</span>
          </button>
        ))}
      </div>
    </section>
  );
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

function pluginPanel(
  plugin: PluginMeta | undefined,
  language: ResolvedLanguage,
  surface: "tray" | "main",
  editorRevision?: number,
  onEditorIntentConsumed?:()=>void,
) {
  if (!plugin) {
    return <EmptyPluginState t={createTranslator(language)} />;
  }

  if (bundledPluginPresentation(plugin.id, language)) {
    const t = createTranslator(language);
    const unavailable = (
      <section className="plugin-panel system-panel">
        <div className="panel-copy">
          <strong>{plugin.title}</strong>
          <span>{t("shell.actionError")}</span>
        </div>
      </section>
    );
    return (
      <LazyPluginPanel
        pluginId={plugin.id}
        language={language}
        surface={surface}
        editorRevision={editorRevision}
        onEditorIntentConsumed={onEditorIntentConsumed}
        fallback={
          <section className="plugin-panel system-panel" aria-busy="true">
            <div className="panel-copy">
              <strong>{plugin.title}</strong>
              <span>{t("shell.loadingTool")}</span>
            </div>
          </section>
        }
        unavailable={unavailable}
      />
    );
  }

  return <GenericPluginPanel plugin={plugin} t={createTranslator(language)} />;
}

function EmptyPluginState({ t }: { t: (key: TranslationKey) => string }) {
  return (
    <section className="plugin-panel system-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">{t("shell.pluginWorkspace")}</span>
          <h2>{PRODUCT_NAME}</h2>
        </div>
        <span className="status-pill">{t("app.tagline")}</span>
      </div>
      <div className="panel-copy">
        <strong>{t("shell.noTools")}</strong>
        <span>{t("shell.noToolsHint")}</span>
      </div>
    </section>
  );
}

function GenericPluginPanel({ plugin, t }: { plugin: PluginMeta; t: (key: TranslationKey) => string }) {
  const [loadError, setLoadError] = useState<string | null>(null);

  if (plugin.viewId) {
    return (
      <section className="plugin-panel system-panel">
        {loadError ? <p className="shell-message error">{loadError}</p> : null}
        <ExtensionSurface
          title={plugin.title}
          pluginId={plugin.id}
          viewId={plugin.viewId}
          onLoadError={setLoadError}
        />
      </section>
    );
  }

  return (
    <section className="plugin-panel system-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">{t("extensions.title")}</span>
          <h2>{plugin.title}</h2>
        </div>
        <span className={`status-pill ${plugin.health === "ready" ? "active" : ""}`}>
          {t(`shell.health.${plugin.health}`)}
        </span>
      </div>
      <div className="panel-copy">
        <strong>{plugin.subtitle}</strong>
        <span>{t("shell.noToolView")}</span>
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
    viewId: record.protocolManifest?.contributes.views[0]?.id,
  };
}

function localizePluginMeta(
  plugin: PluginMeta,
  language: ResolvedLanguage,
): PluginMeta {
  const presentation = bundledPluginPresentation(plugin.id, language);
  if (presentation) {
    return {
      ...plugin,
      ...presentation,
      navigationIcon: bundledPluginModule(plugin.id)?.navigationIcon,
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
  const { pluginHost, t, resolvedLanguage, visiblePlugins, totalPluginCount } = useLocalizedPlugins();
  const statusBar = useStatusBar(pluginHost.records);
  const { activePlugin, setSelectedPlugin } = useSelectedPlugin(
    visiblePlugins,
    pluginHost.selectedPluginName,
    pluginHost.setSelectedPluginName,
  );
  const [message, setMessage] = useState<ShellMessage | null>(null);
  usePluginMessages(setMessage);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      if (moreOpen) setMoreOpen(false);
      else void runShellAction(appWindows.hideTrayQuickPanel, setMessage, t);
    };
    const clearMenu = () => setMoreOpen(false);
    document.addEventListener("keydown", dismiss);
    window.addEventListener("blur", clearMenu);
    return () => {
      document.removeEventListener("keydown", dismiss);
      window.removeEventListener("blur", clearMenu);
    };
  }, [moreOpen, resolvedLanguage]);

  const runAction = (action: () => Promise<void>) =>
    runShellAction(action, setMessage, t).finally(() => setMoreOpen(false));

  return (
    <main className="app-shell tray-shell">
      <header className="app-header" data-tauri-drag-region>
        <div>
          <h1>{PRODUCT_NAME}</h1>
        </div>
        <span className="shell-badge">
          {visiblePlugins.length}/{totalPluginCount} {t("app.pluginCount")}
        </span>
      </header>

      <StatusBarFallbackRow
        disabled={statusBar.isBusy}
        items={statusBar.fallbackItems}
        t={t}
        onRunItem={(itemId) => runAction(() => statusBar.runItemAction(itemId))}
      />

      <PluginNavigation activePluginId={activePlugin?.id} plugins={visiblePlugins} variant="strip" t={t} onSelect={setSelectedPlugin} />

      <div className="tray-plugin-content">{pluginPanel(activePlugin, resolvedLanguage, "tray")}</div>

      {message ? <p className={`shell-message ${message.tone}`}>{message.text}</p> : null}

      <footer className="tray-actions" aria-label={t("shell.systemActions")}>
        <button
          type="button"
          className="tray-icon-action"
          title={t("nav.preferences")}
          aria-label={t("nav.preferences")}
          onClick={() => runAction(appWindows.openPreferencesWindow)}
        >
          ⚙
        </button>
        <button
          type="button"
          className="tray-primary-action"
          onClick={() => runAction(appWindows.openMainWindow)}
        >
          {t("shell.openZero")}
        </button>
        <button
          type="button"
          className="tray-icon-action"
          title={t("shell.more")}
          aria-label={t("shell.more")}
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
              {t("shell.aboutZero")}
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
  const { pluginHost, preferences, t, resolvedLanguage, localizedPlugins, visiblePlugins, totalPluginCount } = useLocalizedPlugins();
  const { activePlugin, setSelectedPlugin } = useSelectedPlugin(
    visiblePlugins,
    pluginHost.selectedPluginName,
    pluginHost.setSelectedPluginName,
  );
  const [message, setMessage] = useState<ShellMessage | null>(null);
  usePluginMessages(setMessage);
  const runAction = (action: () => Promise<void>) => runShellAction(action, setMessage, t);
  const statusBar = useStatusBar(pluginHost.records);
  const { destination, toolRequest, consumeToolIntent, navigate, error: navigationError, isReady } = useMainNavigation();
  const appliedToolRevision = useRef(-1);
  useEffect(() => {
    if (!toolRequest || pluginHost.isLoading || toolRequest.revision <= appliedToolRevision.current) return;
    const target = visiblePlugins.find((plugin) => plugin.id === toolRequest.pluginId);
    appliedToolRevision.current = toolRequest.revision;
    if (target?.enabled) setSelectedPlugin(target.id);
  }, [toolRequest, visiblePlugins, setSelectedPlugin, pluginHost.isLoading]);
  const settingsOpen = destination === "preferences";
  const [settingsVisited, setSettingsVisited] = useState(false);
  const [toolsVisited, setToolsVisited] = useState(false);
  const preferencesButton = useRef<HTMLButtonElement>(null);
  const returnButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!isReady) return;
    if (settingsOpen) setSettingsVisited(true);
    else setToolsVisited(true);
    const frame = requestAnimationFrame(() => {
      if (settingsOpen) returnButton.current?.focus();
      else preferencesButton.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [settingsOpen, isReady]);
  const narrow = useCompactSidebar();
  const collapsed = narrow || preferences.preferences.mainSidebarCollapsed;

  if (!isReady) return <main className="app-loading" aria-busy="true" />;

  return (
    <main className={`app-shell main-window-shell ${collapsed ? "sidebar-collapsed" : ""} ${settingsOpen ? "settings-open" : ""}`}>
      <header className="main-window-header" data-tauri-drag-region>
        <div className="main-window-title">
          <span className="app-mark">
            <StatusBarGlyph icon="zero" />
          </span>
          <div>
            <h1>{settingsOpen ? t("prefs.title") : t("shell.mainTitle")}</h1>
            {!settingsOpen ? <p>{t("shell.mainSubtitle")}</p> : null}
          </div>
        </div>
        <div className="main-window-actions" aria-label={t("shell.systemActions")}>
          {settingsOpen ? (
            <button ref={returnButton} type="button" className="secondary-action return-to-tools" onClick={() => navigate("tools")}>
              <ArrowLeft aria-hidden="true" />{t("shell.returnToTools")}
            </button>
          ) : (
            <button ref={preferencesButton} type="button" className="secondary-action" onClick={() => navigate("preferences")}>
              {t("nav.preferences")}
            </button>
          )}
          <button type="button" className="secondary-action" onClick={() => runAction(appWindows.openAboutWindow)}>
            {t("nav.about")}
          </button>
        </div>
      </header>

      {message ? <p className={`shell-message ${message.tone}`}>{message.text}</p> : null}

      {preferences.storageError ? <p className="shell-message error" role="status">{t("shell.preferencesSaveError")}</p> : null}
      {navigationError ? <p className="shell-message error" role="status">{t("shell.actionError")}: {navigationError}</p> : null}
      {!settingsOpen || toolsVisited ? <PresentationActivity enabled={!settingsOpen}>
        <div className="main-window-layout" hidden={settingsOpen} inert={settingsOpen}>
        <aside className="main-sidebar" id="main-tool-sidebar">
          <div className="main-sidebar-heading">
            {!collapsed ? <div><strong>{t("shell.plugins")}</strong><span>{visiblePlugins.length}/{totalPluginCount} {t("app.pluginCount")}</span></div> : null}
            <button type="button" className="sidebar-toggle" aria-label={t(narrow ? "shell.compactSidebar" : collapsed ? "shell.expandSidebar" : "shell.collapseSidebar")} title={t(narrow ? "shell.compactSidebar" : collapsed ? "shell.expandSidebar" : "shell.collapseSidebar")} aria-expanded={!collapsed} aria-controls="main-tool-sidebar" disabled={narrow} onClick={() => preferences.setMainSidebarCollapsed(!collapsed)}>
              {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
            </button>
          </div>
          <PluginNavigation activePluginId={activePlugin?.id} plugins={visiblePlugins} variant="sidebar" collapsed={collapsed} t={t} onSelect={setSelectedPlugin} />
        </aside>

        <section className="main-workspace" aria-label={activePlugin?.title ?? t("shell.pluginWorkspace")}>
          {pluginPanel(activePlugin, resolvedLanguage, "main",toolRequest?.pluginId===activePlugin?.id && toolRequest?.intent==="editCustom"?toolRequest.revision:undefined,()=>{if(toolRequest)consumeToolIntent(toolRequest.revision);})}
        </section>
      </div>
      </PresentationActivity> : null}
      {settingsOpen || settingsVisited ? (
        <div className="main-settings-view" hidden={!settingsOpen} inert={!settingsOpen}>
          <PreferencesSettingsCenter additionalSettings={BUNDLED_PLUGIN_MODULES.flatMap(module=>module.settingsSearch?.[resolvedLanguage]??[])} renderToolSettings={(pluginId,enabled)=>bundledPluginModule(pluginId)?.loadSettings?<BundledPluginSettings pluginId={pluginId} enabled={enabled} language={resolvedLanguage}/>:undefined} active={settingsOpen} localizedPlugins={localizedPlugins} pluginHost={pluginHost} preferences={preferences} statusBar={statusBar} t={t} />
        </div>
      ) : null}
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
