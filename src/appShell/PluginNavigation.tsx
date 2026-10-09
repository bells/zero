import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { StatusBarGlyph } from "../components/StatusBarGlyph";
import type { PluginId, PluginMeta } from "../core/pluginHost/pluginTypes";
import type { TranslationKey } from "../core/preferences/i18n";
import { navigationOverflow } from "./navigationLayout";

interface Props {
  plugins: PluginMeta[];
  activePluginId: PluginId | undefined;
  onSelect: (id: PluginId) => void;
  t: (key: TranslationKey) => string;
  variant: "strip" | "sidebar";
  collapsed?: boolean;
}

export function PluginNavigation({ plugins, activePluginId, onSelect, t, variant, collapsed = false }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ overflowing: false, previous: false, next: false });
  const [hint, setHint] = useState<{ text: string; left: number; top: number } | null>(null);
  const hintId = useId();
  const collection = plugins.map((plugin) => plugin.id).join("\0");
  const titles = plugins.map((plugin) => plugin.title).join("\0");
  const showHint = useCallback((button: HTMLButtonElement, text: string) => {
    const rect = button.getBoundingClientRect();
    setHint({ text, left: Math.max(8, Math.min(rect.left, window.innerWidth - 268)), top: Math.min(rect.bottom + 6, window.innerHeight - 70) });
  }, []);
  const measure = useCallback(() => {
    const element = viewport.current;
    if (!element) return;
    const next = navigationOverflow(element.scrollLeft, element.clientWidth, element.scrollWidth);
    setOverflow((current) => current.overflowing === next.overflowing && current.previous === next.previous && current.next === next.next ? current : next);
  }, []);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [measure, collection, collapsed]);

  useEffect(() => {
    const selected = Array.from(viewport.current?.querySelectorAll<HTMLButtonElement>("button") ?? []).find((button) => button.dataset.pluginId === activePluginId);
    selected?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    const focused = document.activeElement;
    if (focused instanceof HTMLButtonElement && viewport.current?.contains(focused)) showHint(focused, focused.getAttribute("aria-label") ?? "");
    else setHint(null);
    measure();
  }, [activePluginId, collection, titles, collapsed, measure, showHint]);
  const scroll = (direction: number) => {
    const element = viewport.current;
    element?.scrollBy({ left: direction * Math.max(48, element.clientWidth * 0.8), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };

  return (
    <nav className={`tool-navigation ${variant} ${collapsed ? "collapsed" : ""}`} aria-label={t("shell.plugins")}>
      {variant === "strip" && overflow.overflowing ? <button type="button" className="tool-scroll-control" aria-label={t("shell.previousTools")} disabled={!overflow.previous} onClick={() => scroll(-1)}><ChevronLeft aria-hidden="true" /></button> : null}
      <div className="tool-navigation-viewport" ref={viewport} onScroll={() => {
        measure();
        const focused = document.activeElement;
        if (focused instanceof HTMLButtonElement && viewport.current?.contains(focused)) showHint(focused, focused.getAttribute("aria-label") ?? "");
        else setHint(null);
      }}>
        {plugins.map((plugin) => (
          <button
            type="button" key={plugin.id} data-plugin-id={plugin.id}
            className={`tool-entry ${plugin.id === activePluginId ? "selected" : ""}`}
            aria-label={plugin.title} aria-describedby={hint?.text === plugin.title ? hintId : undefined} aria-pressed={plugin.id === activePluginId}
            aria-description={t(`shell.health.${plugin.health}`)}
            onClick={() => onSelect(plugin.id)}
            onMouseEnter={(event) => showHint(event.currentTarget, plugin.title)}
            onMouseLeave={() => setHint(null)}
            onFocus={(event) => { event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" }); showHint(event.currentTarget, plugin.title); }}
            onBlur={() => setHint(null)}
          >
            <span className="tool-entry-icon">
              {plugin.navigationIcon === "file" ? <FileText aria-hidden="true" /> : <StatusBarGlyph icon={plugin.navigationIcon ?? "extension"} />}
              <span className={`tool-health ${plugin.health}`} aria-hidden="true" />
            </span>
            {variant === "sidebar" && !collapsed ? <span className="tool-entry-name">{plugin.title}</span> : null}
          </button>
        ))}
      </div>
      {variant === "strip" && overflow.overflowing ? <button type="button" className="tool-scroll-control" aria-label={t("shell.nextTools")} disabled={!overflow.next} onClick={() => scroll(1)}><ChevronRight aria-hidden="true" /></button> : null}
      {hint ? createPortal(<div className="tool-name-hint" role="tooltip" id={hintId} style={{ left: hint.left, top: hint.top }}>{hint.text}</div>, document.body) : null}
    </nav>
  );
}
