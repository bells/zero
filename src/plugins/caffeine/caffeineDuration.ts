export type CaffeineFiniteDurationMinutes = 5 | 10 | 15 | 30 | 60 | 120 | 300;
export type CaffeineDurationMinutes = CaffeineFiniteDurationMinutes | null;

export interface CaffeineDurationOption {
  minutes: CaffeineDurationMinutes;
  compactLabel: string;
  labelKey: string;
}

export const CAFFEINE_DURATION_OPTIONS: CaffeineDurationOption[] = [
  { minutes: null, compactLabel: "∞", labelKey: "caffeine.duration.noLimit" },
  { minutes: 5, compactLabel: "5m", labelKey: "caffeine.duration.5m" },
  { minutes: 10, compactLabel: "10m", labelKey: "caffeine.duration.10m" },
  { minutes: 15, compactLabel: "15m", labelKey: "caffeine.duration.15m" },
  { minutes: 30, compactLabel: "30m", labelKey: "caffeine.duration.30m" },
  { minutes: 60, compactLabel: "1h", labelKey: "caffeine.duration.1h" },
  { minutes: 120, compactLabel: "2h", labelKey: "caffeine.duration.2h" },
  { minutes: 300, compactLabel: "5h", labelKey: "caffeine.duration.5h" },
];

export function formatCompactDuration(minutes: CaffeineDurationMinutes): string {
  return (
    CAFFEINE_DURATION_OPTIONS.find((option) => option.minutes === minutes)?.compactLabel ??
    String(minutes) + "m"
  );
}

export function formatDurationClock(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return [hours, minutes, seconds].map(padClockPart).join(":");
  }

  return [minutes, seconds].map(padClockPart).join(":");
}

export function getRemainingMs(expiresAtMs: number | null, nowMs: number): number | null {
  if (expiresAtMs === null) {
    return null;
  }

  return Math.max(0, expiresAtMs - nowMs);
}

function padClockPart(part: number): string {
  return String(part).padStart(2, "0");
}
