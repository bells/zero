import type { PowerTaskSchedule, PowerTaskConditions, JsonValue } from "@zero/sdk";
export const PREFERENCE_KEY = "awake.preferences.v1";
export interface Preferences {
    version: 1;
    custom_input: {
        mode: "duration" | "until";
        duration_minutes: number;
        hour: number;
        minute: number;
    } | null;
    battery_policy: {
        stop_on_low_battery: boolean;
        threshold_percent: number;
        stop_on_low_power_mode: boolean;
    };
}
export const defaultPreferences: Preferences = { version: 1, custom_input: null, battery_policy: { stop_on_low_battery: false, threshold_percent: 10, stop_on_low_power_mode: false } };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
export function readPreferences(value: unknown): Preferences {
    if (value === null)
        return structuredClone(defaultPreferences);
    if (!object(value) || value.version !== 1 || !object(value.battery_policy))
        throw new Error("preferences_unavailable");
    const policy = value.battery_policy, input = value.custom_input;
    if (typeof policy.stop_on_low_battery !== "boolean" || typeof policy.stop_on_low_power_mode !== "boolean" || typeof policy.threshold_percent !== "number" || !Number.isInteger(policy.threshold_percent) || policy.threshold_percent < 10 || policy.threshold_percent > 90 || policy.threshold_percent % 5 !== 0)
        throw new Error("invalid_battery_policy");
    if (input !== null && (!object(input) || !["duration", "until"].includes(String(input.mode)) || typeof input.duration_minutes !== "number" || !Number.isInteger(input.duration_minutes) || input.duration_minutes < 1 || input.duration_minutes > 1440 || typeof input.hour !== "number" || !Number.isInteger(input.hour) || input.hour < 0 || input.hour > 23 || typeof input.minute !== "number" || !Number.isInteger(input.minute) || input.minute < 0 || input.minute > 59))
        throw new Error("invalid_custom_input");
    return value as unknown as Preferences;
}
export function preferenceValue(value: Preferences): JsonValue { return { version: 1, custom_input: value.custom_input ? { ...value.custom_input } : null, battery_policy: { ...value.battery_policy } }; }
export function taskConditions(value: Preferences, allowLowBatteryStart = false): PowerTaskConditions { return { batteryThresholdPercent: value.battery_policy.stop_on_low_battery ? value.battery_policy.threshold_percent : null, stopOnLowPowerMode: value.battery_policy.stop_on_low_power_mode, allowLowBatteryStart }; }
export function durationSchedule(minutes: number): PowerTaskSchedule { if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440)
    throw new Error("invalid_duration"); return { kind: "duration", minutes }; }
// Date's local calendar resolves gaps forward. Search its repeated clock time
// too, so a fall-back occurrence later today wins over tomorrow.
export function resolveUntil(hour: number, minute: number, nowMs: number): number {
    if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59)
        throw new Error('invalid_time');
    const now = new Date(nowMs);
    for (let day = 0; day <= 1; day++) {
        const base = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day, hour, minute);
        const matches: number[] = [];
        for (let offset = -180; offset <= 180; offset++) {
            const candidate = base.getTime() + offset * 60000;
            const local = new Date(candidate);
            if (candidate > nowMs && local.getFullYear() === base.getFullYear() && local.getMonth() === base.getMonth()
                && local.getDate() === base.getDate() && local.getHours() === base.getHours() && local.getMinutes() === base.getMinutes())
                matches.push(candidate);
        }
        if (matches.length)
            return Math.min(...matches);
    }
    throw new Error('invalid_time');
}
export function clock(ms: number | null): string { if (ms === null)
    return "∞"; const seconds = Math.max(0, Math.floor(ms / 1000)); return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(n => String(n).padStart(2, "0")).join(":"); }
