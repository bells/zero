import { useState } from "react";
import { createRoot } from "react-dom/client";
import { registerPlugin, type ZeroBridge, type PowerTaskSchedule } from "@zero/sdk";
import { useAwake } from "./useAwake";
import { clock, durationSchedule, resolveUntil, type Preferences } from "./domain";
import { translator } from "./i18n";
import "./style.css";
const zh = navigator.language.startsWith("zh");
const text = (cn: string, en: string) => zh ? cn : en;
const t = translator(navigator.language);
function Awake({ bridge, compact }: {
    bridge: ZeroBridge; compact: boolean;
}) {
    const awake = useAwake(bridge);
    const [selected, setSelected] = useState<number | null | undefined>(undefined), [custom, setCustom] = useState(false);
    const [mode, setMode] = useState<"duration" | "until">("duration"), [minutes, setMinutes] = useState("60"), [time, setTime] = useState("18:00");
    const [preview, setPreview] = useState<PowerTaskSchedule | null>(null), [invalid, setInvalid] = useState<string | null>(null), [allow, setAllow] = useState(false);
    const currentSelection = selected !== undefined ? selected : awake.task?.active && awake.task.schedule.kind === "duration" ? awake.task.schedule.minutes : null;
    const saved = awake.preferences.custom_input;
    const showEditor = () => { if (saved) {
        setMode(saved.mode);
        setMinutes(String(saved.duration_minutes));
        setTime(`${String(saved.hour).padStart(2, "0")}:${String(saved.minute).padStart(2, "0")}`);
    } setPreview(null); setCustom(true); };
    const customInput = (): NonNullable<Preferences["custom_input"]> => { const [hour, minute] = time.split(":").map(Number); return { mode, duration_minutes: Number(minutes) || 60, hour, minute }; };
    const makePreview = () => { try {
        const input = customInput();
        setPreview(mode === "duration" ? durationSchedule(Number(minutes)) : { kind: "until", expiresAtMs: resolveUntil(input.hour, input.minute, Date.now()) });
        setInvalid(null);
    }
    catch {
        setInvalid(t("caffeine.invalid"));
    } };
    const start = () => {
        const schedule = custom ? preview : selected === undefined && awake.task?.active ? awake.task.schedule : currentSelection === null ? { kind: "unlimited" } as const : durationSchedule(currentSelection);
        if (!schedule) {
            makePreview();
            return;
        }
        if (schedule.kind === "until" && schedule.expiresAtMs <= Date.now()) {
            setPreview(null);
            setInvalid(t("caffeine.expired"));
            return;
        }
        void awake.start(schedule, allow, custom ? customInput() : null);
    };
    const policy = awake.preferences.battery_policy;
    const changePolicy = (patch: Partial<typeof policy>) => void awake.savePolicy(patch);
    const disabled = awake.busy || !awake.ready;
    const low = awake.power?.source === "battery" && awake.power.battery_percent !== null && awake.power.battery_percent !== undefined && awake.power.battery_percent <= policy.threshold_percent && policy.stop_on_low_battery;
    return <main aria-busy={awake.busy} data-compact={compact}>
    <header>
    <h1>Awake</h1>
    <span className={awake.task?.active ? "badge active" : "badge"}>{awake.task?.active ? text("正在保持唤醒", "Keeping awake") : text("已停止", "Stopped")}
    </span>
    </header>
    <section className="status" aria-live="polite">
    <div>
    <small>{t("caffeine.elapsed")}
    </small>
    <strong>{clock(awake.task?.elapsedMs ?? 0)}
    </strong>
    </div>
    <div>
    <small>{t("caffeine.message.remaining")}
    </small>
    <strong>{awake.task?.active ? clock(awake.task.remainingMs) : "—"}
    </strong>
    </div>
    </section>
    {awake.task?.active && awake.task.expiresAtMs !== null && <p>{t("caffeine.until")} {new Date(awake.task.expiresAtMs).toLocaleString()}
        </p>}
    {awake.task?.lastStopReason && <p role="status">{awake.task.lastStopReason === "expired" ? t("caffeine.stop.expired") : awake.task.lastStopReason === "power.lowBattery" ? t("caffeine.stop.low_battery") : awake.task.lastStopReason === "power.lowPowerMode" ? t("caffeine.stop.low_power_mode") : text("系统保活已结束", "System power assertion ended")}
        </p>}
    {awake.policyPending && <p role="alert" className="error">{text("设置已保存，但尚未确认在当前任务生效。下方显示上次确认的有效保护。", "Settings are saved, but their application to the current task is not confirmed. Last confirmed protection is shown below.")}<br/>{text("上次确认的电量阈值", "Last confirmed battery threshold")}: {awake.task?.conditions.batteryThresholdPercent ?? "—"}%; {text("上次确认的低电量模式保护", "Last confirmed low-power protection")}: {awake.task?.conditions.stopOnLowPowerMode ? text("开启","On") : text("关闭","Off")}</p>}
    {(awake.error || !awake.ready || awake.policyPending) && <button type="button" disabled={awake.busy} onClick={()=>void awake.retry()}>{text("重新读取并协调状态", "Retry configuration and protection")}</button>}
    {(awake.error || invalid) && <p className="error" role="alert">{invalid ?? (awake.error === "power.lowPowerMode" ? t("caffeine.lowPowerDenied") : awake.error === "power.lowBattery" ? text("当前电量低于保护阈值，请明确勾选本次豁免。", "Battery is below your limit. Explicitly allow this session to continue.") : awake.error === "policy_pending" ? text("保护设置尚待生效，将重试协调；请检查当前有效保护。", "Protection changes are pending. Reconciliation will retry; check the current effective protection.") : awake.error === "preferences_save_failed" ? t("caffeine.save") : awake.error === "preferences_unavailable" ? t("caffeine.read") : text("操作失败，请重试。", "Operation failed. Please retry."))}
        </p>}
    <fieldset disabled={disabled}>
    <legend>{t("caffeine.plan")}
    </legend>
      {!custom ? <>
        <div className="presets">{[null, 5, 10, 15, 30, 60, 120, 300].map(value => <button type="button" key={String(value)} aria-pressed={!(selected === undefined && awake.task?.active && awake.task.schedule.kind === "until") && currentSelection === value} onClick={() => { setSelected(value); setInvalid(null); }}>{value === null ? "∞" : `${value}m`}
            </button>)}
        </div>
        <button type="button" className="custom" onClick={showEditor}>{t("caffeine.custom")} →</button>
        </> : <div className="editor">
        <button type="button" onClick={() => { setCustom(false); setInvalid(null); }}>← {t("caffeine.back")}
        </button>
        <label>{t("caffeine.planMode")}
        <select value={mode} onChange={e => { setMode(e.target.value === "until" ? "until" : "duration"); setPreview(null); }}>
        <option value="duration">{t("caffeine.durationMode")}
        </option>
        <option value="until">{t("caffeine.untilMode")}
        </option>
        </select>
        </label>{mode === "duration" ? <label>{t("caffeine.durationValue")}
            <input type="number" min="1" max="1440" step="1" value={minutes} onChange={e => { setMinutes(e.target.value); setPreview(null); }}/>
            </label> : <label>{t("caffeine.time")}
            <input type="time" required value={time} onChange={e => { setTime(e.target.value); setPreview(null); }}/>
            </label>}
        <button type="button" onClick={makePreview}>{t("caffeine.preview")}
        </button>{preview && <p>{preview.kind === "until" ? new Date(preview.expiresAtMs).toLocaleString() : preview.kind === "duration" ? `${preview.minutes} ${t("caffeine.durationValue")}` : "∞"}
            </p>}
        </div>}
      {low && <label className="check">
        <input type="checkbox" checked={allow} onChange={e => setAllow(e.target.checked)}/>{t("caffeine.battery.override")}
        </label>}
      <div className="actions">
    <button className="primary" type="button" onClick={start}>{awake.task?.active ? t("caffeine.apply") : t("caffeine.start")}
    </button>
    </div>
    </fieldset>
    {awake.task?.active && <button type="button" disabled={awake.busy||!awake.nativeReady} onClick={()=>void awake.stop()}>{t("caffeine.disable")}</button>}
    <details open={!compact}>
    <summary>{t("caffeine.battery.title")}</summary>
    <fieldset disabled={disabled}>
    <legend>{t("caffeine.battery.title")}
    </legend>
    <p>{t("caffeine.battery.description")}
    </p>
    <label className="check">
    <input type="checkbox" checked={policy.stop_on_low_battery} onChange={e => changePolicy({ stop_on_low_battery: e.target.checked })}/>{t("caffeine.battery.threshold")}
    </label>
    <label>{t("caffeine.battery.thresholdLabel")}
    <select disabled={!policy.stop_on_low_battery} value={policy.threshold_percent} onChange={e => changePolicy({ threshold_percent: Number(e.target.value) })}>{Array.from({ length: 17 }, (_, i) => 10 + i * 5).map(value => <option key={value} value={value}>{value}%</option>)}
    </select>
    </label>
    <label className="check">
    <input type="checkbox" checked={policy.stop_on_low_power_mode} onChange={e => changePolicy({ stop_on_low_power_mode: e.target.checked })}/>{t("caffeine.battery.mode")}
    </label>
    </fieldset>
    </details>
    <footer>{awake.power?.source === "external" ? text("接通电源", "External power") : awake.power?.battery === "no_battery" ? t("caffeine.battery.noBattery") : awake.power?.battery_percent !== null && awake.power?.battery_percent !== undefined ? `${awake.power.battery_percent}% · ${text("电池供电", "On battery")}` : text("电源状态未知", "Power status unknown")}{awake.task?.protectionUnavailable && <p>{t("caffeine.protectionUnavailable")}
        </p>}{awake.task?.batteryThresholdOverridden && <p>{t("caffeine.override")}
        </p>}
    </footer>
  </main>;
}
registerPlugin({ activate(context) { const node = document.getElementById("root"); if (!node)
        throw new Error("Missing Awake root"); const root = createRoot(node); root.render(<Awake bridge={context.bridge} compact={context.session.surfaceId.endsWith(".tray")}/>); context.subscriptions.push({ dispose: () => root.unmount() }); } });
