import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  BundledPluginPanelProps,
} from "../core/pluginHost/pluginModule";
import type { ResolvedLanguage } from "../core/preferences/i18n";
import { bundledPluginPanelLoader } from "./bundledPluginModules";
import { DiagnosticBoundary } from "./DiagnosticBoundary";

const panelComponents = new Map<
  string,
  LazyExoticComponent<ComponentType<BundledPluginPanelProps>>
>();
const activatedPluginIds = new Set<string>();

interface LazyPluginPanelProps {
  pluginId: string;
  language: ResolvedLanguage;
  fallback: ReactNode;
  unavailable: ReactNode;
}

export function LazyPluginPanel({
  pluginId,
  language,
  fallback,
  unavailable,
}: LazyPluginPanelProps) {
  const loader = bundledPluginPanelLoader(pluginId);
  if (!loader) return unavailable;

  let Panel = panelComponents.get(pluginId);
  if (!Panel) {
    Panel = lazy(loader);
    panelComponents.set(pluginId, Panel);
  }

  return (
    <DiagnosticBoundary key={pluginId} pluginId={pluginId} fallback={unavailable}>
      <Suspense fallback={fallback}>
        <Panel language={language} />
        <PluginActivationMarker pluginId={pluginId} />
      </Suspense>
    </DiagnosticBoundary>
  );
}

function PluginActivationMarker({ pluginId }: { pluginId: string }) {
  const startedAtMs = useRef(performance.now());

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const first = !activatedPluginIds.has(pluginId);
      activatedPluginIds.add(pluginId);
      void invoke("record_plugin_activation", {
        input: {
          pluginId,
          first,
          durationUs: Math.max(0, Math.round((performance.now() - startedAtMs.current) * 1_000)),
        },
      }).catch(() => undefined);
    });
    return () => cancelAnimationFrame(frame);
  }, [pluginId]);

  return null;
}
