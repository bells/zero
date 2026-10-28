export interface CaffeineUnlimitedSchedule { kind: "unlimited" }
export interface CaffeineDurationSchedule { kind: "duration"; minutes: number }
export interface CaffeineUntilSchedule { kind: "until"; expires_at_ms: number }
export type CaffeineSchedule = CaffeineUnlimitedSchedule | CaffeineDurationSchedule | CaffeineUntilSchedule;
export interface AwakeBatteryPolicy {
  stop_on_low_battery: boolean;
  threshold_percent: number;
  stop_on_low_power_mode: boolean;
}
export interface AwakeCustomInput { mode: "duration" | "until"; duration_minutes: number; hour: number; minute: number }
export interface AwakePreferences { version: number; custom_input: AwakeCustomInput | null; battery_policy: AwakeBatteryPolicy }
export interface AwakePowerSnapshot {
  source: "battery" | "external" | "unknown";
  battery: "supported" | "no_battery" | "unsupported" | "unknown";
  battery_percent: number | null;
  low_power_mode_capability: "supported" | "unsupported" | "unknown";
  low_power_mode: boolean | null;
}
export interface AwakeBatteryPolicyUpdate { policy: AwakeBatteryPolicy; session: CaffeineSnapshot }


export interface CaffeineActionError {
  action: "enable" | "disable" | "toggle" | "exit" | "expiry";
  code: "operation_failed" | "hide_failed" | "display_failed" | "preferences_save_failed" | "low_power_mode" | "policy_unavailable";
}

export interface CaffeineSnapshot {
  enabled: boolean;
  started_at_ms: number | null;
  duration_minutes: number | null;
  schedule: CaffeineSchedule | null;
  elapsed_ms: number | null;
  remaining_ms: number | null;
  battery_threshold_overridden: boolean;
  protection_unavailable: boolean;
  last_stop_reason: "expired" | "low_battery" | "low_power_mode" | null;
  expires_at_ms: number | null;
  message: string;
  action_error: CaffeineActionError | null;
}

// Each reveal/mutation invalidates work issued for the previous surface state.
export function createCaffeineRefresh(
  read: () => Promise<CaffeineSnapshot>,
  accept: (snapshot: CaffeineSnapshot) => void,
) {
  let generation = 0;
  return {
    invalidate() { generation += 1; },
    async refresh() {
      const request = ++generation;
      let snapshot: CaffeineSnapshot;
      try { snapshot = await read(); }
      catch (error: unknown) {
        if (request !== generation) return false;
        throw error;
      }
      if (request !== generation) return false;
      accept(snapshot);
      return true;
    },
  };
}

export function policySaveFeedback(result: Pick<AwakeBatteryPolicyUpdate,"session">): "saved" | "stop_failed" {
  return result.session.action_error?.action === "disable" && result.session.action_error.code === "operation_failed" ? "stop_failed" : "saved";
}
