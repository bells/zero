import { useEffect, useId, useRef, useState } from "react";
import { displayShortcut, recordShortcut, shortcutStatusMessageKey, type GlobalShortcutSnapshot, type SetSnapShortcutInput } from "../../services/globalShortcutServiceCore";
import type { TranslationKey } from "./i18n";
import { preferencesSettingFocusTargetId } from "./preferencesNavigation";

export interface ShortcutEditorProps {
  isSaving: boolean;
  onSetShortcut: (input: SetSnapShortcutInput) => Promise<boolean>;
}

export function ShortcutSetting({ shortcut, t, toolScoped = false, isSaving, onSetShortcut }: ShortcutEditorProps & {
  shortcut: GlobalShortcutSnapshot;
  t: (key: TranslationKey) => string;
  toolScoped?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const recordButton = useRef<HTMLButtonElement>(null);
  const descriptionId = useId();
  const settingId = toolScoped
    ? `tool.${shortcut.pluginName}.shortcut${shortcut.id === "snapOcr" ? ".ocr" : ""}`
    : shortcut.id === "snapCapture" ? "shortcuts.snap" : shortcut.id === "snapOcr" ? "shortcuts.snapOcr" : "shortcuts.launch";
  const title = t(shortcut.id === "snapCapture" ? "prefs.shortcuts.snap" : shortcut.id === "snapOcr" ? "prefs.shortcuts.snapOcr" : "prefs.shortcuts.launch");
  const editable = shortcut.editable && shortcut.id !== "launchPanel" && shortcut.platformSupported;
  const finishRecording = () => { setRecording(false); recordButton.current?.focus(); };

  useEffect(() => {
    const stopOther = (event: Event) => {
      if (event instanceof CustomEvent && event.detail !== shortcut.id) setRecording(false);
    };
    const stopOnBlur = () => setRecording(false);
    window.addEventListener("zero-shortcut-recording", stopOther);
    window.addEventListener("blur", stopOnBlur);
    return () => {
      window.removeEventListener("zero-shortcut-recording", stopOther);
      window.removeEventListener("blur", stopOnBlur);
    };
  }, [shortcut.id]);

  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat || event.isComposing) return;
      const result = recordShortcut(event);
      if (result.kind === "pending") return;
      setRecording(false);
      recordButton.current?.focus();
      if (result.kind === "shortcut" && shortcut.id !== "launchPanel") {
        void onSetShortcut({ id: shortcut.id, accelerator: result.accelerator });
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recording, shortcut.id, onSetShortcut]);

  return <div className="preferences-setting-row preferences-shortcut-row" id={preferencesSettingFocusTargetId(settingId)} tabIndex={-1}>
    <div className="preferences-setting-copy">
      <h4>{title}</h4>
      <p id={descriptionId}>{recording ? t("prefs.shortcuts.recording") : `${t("prefs.shortcuts.owner")}: ${shortcut.pluginName}`}</p>
      <span className={`preferences-setting-status${shortcut.registrationState === "conflict" ? " error" : ""}`} role="status">{t(shortcutStatusMessageKey(shortcut.registrationState))}</span>
      {shortcut.diagnosticCode === "shortcut.invalidConfiguration" ? <p role="alert">{t("prefs.shortcuts.error.invalidConfiguration")}</p> : null}
    </div>
    <div className="preferences-shortcut-controls">
      <kbd>{shortcut.accelerator ? displayShortcut(shortcut.accelerator, /Mac/.test(navigator.platform)) : t("prefs.shortcuts.unassigned")}</kbd>
      {editable ? <>
        <button ref={recordButton} type="button" aria-describedby={descriptionId} aria-pressed={recording} disabled={isSaving} onClick={() => { window.dispatchEvent(new CustomEvent("zero-shortcut-recording", { detail: shortcut.id })); setRecording(value => !value); }}>{t(recording ? "prefs.shortcuts.cancel" : "prefs.shortcuts.record")}</button>
        {recording ? <button type="button" onClick={finishRecording}>{t("prefs.shortcuts.cancel")}</button> : <>
          <button type="button" disabled={isSaving || shortcut.accelerator === null} onClick={() => { if (shortcut.id !== "launchPanel") void onSetShortcut({ id: shortcut.id, accelerator: null }); }}>{t("prefs.shortcuts.clear")}</button>
          <button type="button" disabled={isSaving || shortcut.accelerator === shortcut.defaultAccelerator} onClick={() => { if (shortcut.id !== "launchPanel") void onSetShortcut({ id: shortcut.id, accelerator: shortcut.defaultAccelerator }); }}>{t("prefs.shortcuts.reset")}</button>
        </>}
      </> : <span>{t("prefs.shortcuts.readOnly")}</span>}
    </div>
  </div>;
}
