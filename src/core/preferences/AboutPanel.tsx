import { useState } from "react";
import { ArrowUpRight, Check, Copy, FolderOpen, Code, Globe, LifeBuoy, RefreshCw, Trash2 } from "lucide-react";
import type { PluginMeta } from "../pluginHost/pluginTypes";
import type { PluginHostSummary } from "../pluginHost/pluginHostModel";
import type { TranslationKey } from "./i18n";
import { StatusBarGlyph } from "../../components/StatusBarGlyph";
import { useDiagnostics } from "../diagnostics/useDiagnostics";

interface AboutPanelProps {
  plugins: PluginMeta[];
  summary?: PluginHostSummary;
  t: (key: TranslationKey) => string;
}

export function AboutPanel({ plugins, summary, t }: AboutPanelProps) {
  const d = useDiagnostics();
  const [confirmClear, setConfirmClear] = useState(false);
  const busy = d.pending !== null;
  const counts = [
    ["about.bundled", summary?.bundled ?? plugins.length], ["about.market", summary?.market ?? 0],
    ["about.local", summary?.local ?? 0], ["about.disabled", summary?.disabled ?? 0],
    ["about.failed", summary?.failed ?? 0], ["about.incompatible", summary?.incompatible ?? 0],
  ] as const;
  return (
    <section className="plugin-panel system-panel about-panel" aria-busy={busy}>
      <div className="about-identity">
        <div className="about-mark"><StatusBarGlyph icon="zero" /></div>
        <div><h2>Zero</h2><span className="about-version">{d.info ? `v${d.info.appVersion}` : t("diagnostics.loading")}</span></div>
      </div>
      <div className="panel-copy about-description">
        <strong>{t("about.descriptionTitle")}</strong><span>{t("about.description")}</span>
      </div>
      <div className="about-project-actions" aria-label={t("about.projectLinks")}>
        <button className="about-action" type="button" disabled={busy} onClick={() => void d.openLink("github")}>
          <Code size={18} aria-hidden="true" /><span className="about-project-label"><strong>GitHub</strong>{d.info && <small>{d.info.githubUrl.replace(/^https:\/\//, "")}</small>}</span><ArrowUpRight size={15} aria-hidden="true" />
        </button>
        <button className="about-action" type="button" disabled={busy} onClick={() => void d.openLink("website")}>
          <Globe size={18} aria-hidden="true" /><span className="about-project-label"><strong>{t("about.website")}</strong>{d.info && <small>{d.info.websiteUrl.replace(/^https:\/\//, "")}</small>}</span><ArrowUpRight size={15} aria-hidden="true" />
        </button>
      </div>
      <div className="about-support">
        <p className="about-section-label">{t("about.support")}</p>
        <div className="about-support-actions">
          <button type="button" className="about-action" disabled={busy} onClick={() => void d.openDirectory()}><FolderOpen size={17} aria-hidden="true" /><span>{t("about.openLogs")}</span></button>
          <button type="button" className="about-action" disabled={busy} onClick={() => void d.copy()}><Copy size={17} aria-hidden="true" /><span>{t("about.copyDiagnostics")}</span></button>
          <button type="button" className="about-action" disabled={busy} onClick={() => void d.openLink("issues")}><LifeBuoy size={17} aria-hidden="true" /><span>{t("about.reportIssue")}</span></button>
        </div>
        <div className={`about-feedback${d.feedback?.error ? " is-error" : ""}`} role="status" aria-live="polite" aria-atomic="true">
          {busy ? t("diagnostics.working") : d.feedback ? <>{!d.feedback.error && <Check size={14} aria-hidden="true" />}{t(d.feedback.key)}</> : t("diagnostics.localOnly")}
        </div>
      </div>
      <details className="about-details" open={d.expanded} onToggle={event => d.setExpanded(event.currentTarget.open)}>
        <summary>{t("diagnostics.details")}</summary>
        <div className="about-diagnostics-content">
          <p>{t("diagnostics.scope")}</p>
          {d.status && <p className="about-diagnostics-status">{t(`diagnostics.persistence.${d.status.persistence}`)} · {t("diagnostics.dropped")}: {d.status.droppedEvents}</p>}
          <div className="about-diagnostic-controls">
            <button type="button" className="secondary-action" disabled={busy} onClick={() => void d.refresh()}><RefreshCw size={14} aria-hidden="true" />{t("diagnostics.refresh")}</button>
            <button type="button" className="secondary-action" disabled={busy} onClick={() => setConfirmClear(true)}><Trash2 size={14} aria-hidden="true" />{t("diagnostics.clear")}</button>
          </div>
          <label className="about-verbose"><input type="checkbox" checked={d.status?.mode === "verbose"} disabled={busy || !d.status} onChange={event => void d.setMode(event.currentTarget.checked ? "verbose" : "normal")} />{t("diagnostics.verbose")}</label>
          {d.status?.mode === "verbose" && <p>{t("diagnostics.remaining")}: {Math.ceil(d.status.verboseRemainingSeconds / 60)} {t("diagnostics.minutes")}</p>}
          {confirmClear && <div className="about-clear-confirm" role="group" aria-label={t("diagnostics.clearConfirm")}>
            <p>{t("diagnostics.clearConfirm")}</p>
            <button type="button" className="secondary-action" disabled={busy} onClick={() => { setConfirmClear(false); void d.clear(); }}>{t("diagnostics.confirmClear")}</button>
            <button type="button" className="secondary-action" disabled={busy} onClick={() => setConfirmClear(false)}>{t("diagnostics.cancel")}</button>
          </div>}
          {d.preview ? <>
            <label className="about-preview-label" htmlFor="diagnostic-preview">{t("diagnostics.preview")} · <time dateTime={d.preview.generatedAt}>{new Date(d.preview.generatedAt).toLocaleTimeString()}</time></label>
            {(d.preview.truncated || d.preview.omissions.length > 0) && <p role="status">{t("diagnostics.partial")}</p>}
            <textarea id="diagnostic-preview" className="about-preview" readOnly value={d.preview.text} spellCheck={false} />
            <button type="button" className="about-action" disabled={busy} onClick={() => void d.copy()}><Copy size={15} aria-hidden="true" />{t("diagnostics.copyReviewed")}</button>
          </> : <p>{t("diagnostics.noPreview")}</p>}
        </div>
      </details>
      <details className="about-details"><summary>{t("about.pluginDetails")} <span>{summary?.total ?? plugins.length}</span></summary>
        <div className="about-grid">{counts.map(([key, count]) => <div className="about-stat" key={key}><span>{t(key)}</span><strong>{count}</strong></div>)}<div className="about-stat"><span>{t("about.runtime")}</span><strong>{t("about.trayRuntime")}</strong></div></div>
      </details>
    </section>
  );
}
