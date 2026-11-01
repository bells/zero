import { useRef, useState } from "react";
import type { BundledPluginSettingsProps } from "../../core/pluginHost/pluginModule";
import { useSurfaceActivity } from "../../core/windowing/useSurfaceActivity";
import { bingWallpaperService } from "./bingWallpaperService";
import { errorMessage } from "./bingWallpaperController";
import { createBingWallpaperTranslator } from "./i18n";
import { usePaperRuntime } from "./usePaperRuntime";
import { PaperStatus } from "./PaperStatus";

export function PaperSettings({ language, enabled }: BundledPluginSettingsProps) {
  const t = createBingWallpaperTranslator(language);
  const activity = useSurfaceActivity();
  const paper = usePaperRuntime(activity === "active");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const busy = useRef(false);
  const change = async (autoChangeDaily: boolean) => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await bingWallpaperService.updatePaperSettings({ autoChangeDaily });
      paper.setSettings(saved);
    } catch (reason) { setSaveError(errorMessage(reason)); }
    finally { busy.current = false; setSaving(false); }
  };
  const unsupported = paper.runtime?.phase === "unsupported";
  return (
    <section className="preferences-section paper-settings" aria-busy={saving} aria-labelledby="paper-settings-heading">
      <div className="preferences-section-heading">
        <h3 id="paper-settings-heading">{t("paper.settingsTitle")}</h3>
        <p>{t("paper.runningOnly")}</p>
      </div>
      <div className="preferences-settings-group">
        <div className="preferences-setting-row" id="preference-setting-tool-zero-paper-daily" tabIndex={-1}>
          <div className="preferences-setting-copy">
            <label htmlFor="paper-daily-toggle">{t("paper.daily")}</label>
            <p>{t("paper.manualProtection")}</p>
          </div>
          <input id="paper-daily-toggle" type="checkbox" role="switch"
            checked={paper.settings?.autoChangeDaily ?? false}
            disabled={saving || !paper.settings || (!paper.settings.autoChangeDaily && (!enabled || unsupported))}
            onChange={event => void change(event.currentTarget.checked)} />
        </div>
      </div>
      {!enabled ? <p>{t("paper.pluginDisabled")}</p> : null}
      <PaperStatus runtime={paper.runtime} t={t} detailed />
      {paper.error || saveError ? <p role="alert">{saveError ?? paper.error}</p> : null}
    </section>
  );
}
