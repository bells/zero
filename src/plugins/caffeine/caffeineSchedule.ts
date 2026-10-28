import type { CaffeineSchedule, CaffeineSnapshot } from './caffeineState';

export function parseDuration(hours: string, minutes: string): number | null {
  if (!/^\d{1,2}$/.test(hours) || !/^\d{1,2}$/.test(minutes)) return null;
  const h = Number(hours), m = Number(minutes), total = h * 60 + m;
  return h <= 24 && m <= 59 && total >= 1 && total <= 1440 ? total : null;
}

// Date's local calendar resolves gaps forward. Search its repeated clock time
// too, so a fall-back occurrence later today wins over tomorrow.
export function resolveUntil(hour: number, minute: number, nowMs: number): number {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error('invalid_time');
  const now = new Date(nowMs);
  for (let day = 0; day <= 1; day++) {
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day, hour, minute);
    const matches: number[] = [];
    for (let offset = -180; offset <= 180; offset++) {
      const candidate = base.getTime() + offset * 60000;
      const local = new Date(candidate);
      if (candidate > nowMs && local.getFullYear() === base.getFullYear() && local.getMonth() === base.getMonth()
        && local.getDate() === base.getDate() && local.getHours() === base.getHours() && local.getMinutes() === base.getMinutes()) matches.push(candidate);
    }
    if (matches.length) return Math.min(...matches);
  }
  throw new Error('invalid_time');
}

export function confirmPreview(schedule: CaffeineSchedule, nowMs: number): boolean {
  return schedule.kind !== 'until' || schedule.expires_at_ms > nowMs;
}

export function estimateTiming(snapshot: Pick<CaffeineSnapshot, 'enabled' | 'schedule' | 'elapsed_ms' | 'remaining_ms' | 'expires_at_ms'>, observedAt: number, monoNow: number, wallNow: number) {
  const delta = Math.max(0, monoNow - observedAt);
  return {
    elapsed: snapshot.enabled ? (snapshot.elapsed_ms ?? 0) + delta : 0,
    remaining: snapshot.schedule?.kind === 'until'
      ? Math.max(0, (snapshot.expires_at_ms ?? wallNow) - wallNow)
      : snapshot.remaining_ms === null ? null : Math.max(0, snapshot.remaining_ms - delta),
  };
}

export function formatEndTime(epoch: number, language: string, nowMs = Date.now()): string {
  const end = new Date(epoch), now = new Date(nowMs);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const zh = language.startsWith('zh');
  const date = sameDay(end, now) ? zh ? '今天' : 'Today' : sameDay(end, tomorrow) ? zh ? '明天' : 'Tomorrow' : end.toLocaleDateString(language);
  return `${date} ${end.toLocaleTimeString(language, {hour:'2-digit',minute:'2-digit',hour12:false})}`;
}
