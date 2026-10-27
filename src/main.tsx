import React, { lazy, Suspense, type ComponentType } from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";
import { DiagnosticBoundary } from "./appShell/DiagnosticBoundary";
import { resolveAppSurface } from "./appShell/appSurface";
import { bundledPluginSurfaceLoader } from "./appShell/bundledPluginModules";
import type { BundledPluginSurface } from "./core/pluginHost/pluginModule";
import {
  SURFACE_ACTIVITY_EVENT,
  type SurfaceActivityPayload,
} from "./core/windowing/surfaceActivityCore";

const label = getCurrentWindow().label;
const surface = resolveAppSurface(label);
const surfacePlugin = label === "zero-file-engine" ? null
  : surface === "launcher" ? "zero.launch"
    : surface === "paper" ? "zero.paper"
      : ["capture", "pin"].includes(surface) ? "zero.snap" : null;

async function loadRoutedApp(): Promise<{ default: ComponentType }> {
  if (import.meta.env.VITE_ZERO_HAS_FILE && label === "zero-file-engine") {
    const module = await import("./plugins/file/engine/FileEngineApp");
    return { default: module.FileEngineApp };
  }
  if (isBundledPluginSurface(surface)) {
    const loader = bundledPluginSurfaceLoader(surface);
    if (loader) return loader();
  }
  const shell = await import("./App");
  const component = surface === "main"
    ? shell.MainWindowApp
    : surface === "about"
      ? shell.AboutWindowApp
      : shell.TrayPanelApp;
  return { default: component };
}

function isBundledPluginSurface(
  surface: string,
): surface is BundledPluginSurface {
  return ["capture", "pin", "launcher", "paper"].includes(surface);
}

function renderApp(RoutedApp: ComponentType) {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <Suspense fallback={<div className="app-loading" aria-busy="true" />}>
        {surfacePlugin ? (
          <DiagnosticBoundary pluginId={surfacePlugin} fallback={<div className="app-loading" role="alert">工具界面暂不可用 / Tool UI unavailable.</div>}>
            <RoutedApp />
          </DiagnosticBoundary>
        ) : <RoutedApp />}
      </Suspense>
    </React.StrictMode>,
  );
}

if (surface === "capture") {
  // This window stays hidden until its pixels are ready. Mounting a loading
  // fallback first adds React's Suspense retry throttle to every capture.
  void loadRoutedApp().then(
    ({ default: CaptureApp }) => renderApp(CaptureApp),
    (error: unknown) => renderApp(() => { throw error; }),
  );
} else {
  renderApp(lazy(loadRoutedApp));
}

void listen<SurfaceActivityPayload>(SURFACE_ACTIVITY_EVENT, (event) => {
  if (event.payload.label !== label || event.payload.state !== "active") {
    return;
  }
  requestAnimationFrame(() => {
    void invoke("mark_surface_ready").catch(() => undefined);
  });
}).catch(() => {
  // Runtime measurement is optional and must not affect a surface lifecycle.
});

requestAnimationFrame(() => {
  void invoke("mark_frontend_ready").catch(() => {
    // Performance instrumentation is best-effort and never blocks rendering.
  });
});
