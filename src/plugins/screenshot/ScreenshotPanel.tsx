import { Copy, Download, ScanText } from "lucide-react";
import { useSnapOcr } from "./useSnapOcr";
import { SnapOcrResult } from "./SnapOcrResult";
import { type ScreenshotAction, useScreenshotPlugin } from "./useScreenshotPlugin";
import { useGlobalShortcuts } from "../../services/useGlobalShortcuts";
import { displayShortcut } from "../../services/globalShortcutServiceCore";
import { SCREENSHOT_USAGE_KEYS } from "./screenshotMeta";
import type { TranslationKey } from "./i18n";
import "./screenshot.css";

interface ScreenshotPanelProps {
  t: (key: TranslationKey) => string;
  surface: "tray" | "main";
}

export function ScreenshotPanel({ t, surface }: ScreenshotPanelProps) {
  const screenshot = useScreenshotPlugin();
  const ocr = useSnapOcr(surface);
  const message = screenshot.messageDetail
    ? `${t(screenshot.messageKey)}: ${screenshot.messageDetail}`
    : t(screenshot.messageKey);
  const hasError = screenshot.messageKey === "screenshot.status.startError"
    || screenshot.messageKey === "screenshot.status.initError";
  const showFeedback = hasError || screenshot.messageKey.endsWith("Started")
    || screenshot.messageKey === "ocr.started";
  const shortcuts = useGlobalShortcuts();
  const activeShortcut = (id: "snapCapture" | "snapOcr") => {
    const entry = shortcuts.snapshots.find(value => value.id === id);
    return entry?.registrationState === "active" && entry.accelerator ? displayShortcut(entry.accelerator, screenshot.capabilities.platform === "macOS") : null;
  };
  const shortcut = activeShortcut("snapCapture");
  const ocrShortcut = activeShortcut("snapOcr");
  const launch = (action: ScreenshotAction) => {
    void screenshot.start(action);
  };

  return (
    <section className={`plugin-panel screenshot-panel snap-${surface}`} aria-busy={screenshot.isBusy}>
      <header className="snap-heading">
        <h2>{t("screenshot.title")}</h2>
        {shortcut ? <div className="snap-shortcut" aria-label={t("screenshot.shortcut")}>
          <kbd>{shortcut}</kbd>
        </div> : null}
      </header>
      <p className="snap-hint">
        {screenshot.capabilities.custom_overlay
          ? t("screenshot.captureHint")
          : screenshot.capabilities.system_launcher
            ? t("screenshot.systemHint")
            : t("screenshot.shortcutHint")}
      </p>

      <div className="snap-actions">
        <button type="button" className="primary-action snap-copy" onClick={() => launch("copy")} disabled={screenshot.isBusy}>
          <Copy aria-hidden="true" />
          {t("screenshot.copyAction")}
        </button>
        <button type="button" className="secondary-action" onClick={() => launch("save")} disabled={screenshot.isBusy}>
          <Download aria-hidden="true" />
          {t("screenshot.saveAction")}
        </button>
        <button type="button" className="secondary-action" onClick={() => launch("ocr")} disabled={screenshot.isBusy || !ocr.capability?.available} title={ocr.capability?.available ? t("ocr.originalHint") : t("ocr.unavailable")}>
          <ScanText aria-hidden="true" />
          {t("ocr.capture")}
          {ocrShortcut ? <kbd className="snap-action-shortcut">{ocrShortcut}</kbd> : null}
        </button>
      </div>
      {showFeedback ? <p className={`snap-feedback${hasError ? " error" : ""}`} role={hasError ? "alert" : "status"}>{message}</p> : null}
      {!ocr.capability?.available && ocr.capability && (surface === "tray" || ocr.snapshot) ? <p className="snap-note">{t("ocr.unavailable")}</p> : null}

      {surface === "main" ? <>
        {screenshot.capabilities.custom_overlay ? <details className="snap-guide">
          <summary>{t("screenshot.guide")}</summary>
          <ul>{SCREENSHOT_USAGE_KEYS.map(key => <li key={key}>{t(key)}</li>)}</ul>
        </details> : null}
        {ocr.snapshot ? <SnapOcrResult ocr={ocr} t={t} /> : <section className="snap-ocr-empty" aria-label={t("ocr.result")}>
          <h3>{t("ocr.result")}</h3>
          <p>{ocr.capability ? ocr.capability.available ? t("ocr.resultHint") : t("ocr.unavailable") : t("screenshot.status.initializing")}</p>
        </section>}
      </> : null}
    </section>
  );
}
