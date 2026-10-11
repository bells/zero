import type { CaffeineDurationMinutes } from "./caffeineDuration";

export interface CaffeineActionError {
  action: "enable" | "disable" | "toggle" | "exit" | "expiry";
  code: "operation_failed" | "hide_failed" | "display_failed";
}

export interface CaffeineSnapshot {
  enabled: boolean;
  started_at_ms: number | null;
  duration_minutes: CaffeineDurationMinutes;
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
