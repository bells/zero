import type { QuickLauncherResultItem } from "./contracts";

export interface QuickLauncherGroups {
  applications: QuickLauncherResultItem[];
  settings: QuickLauncherResultItem[];
}

export type QuickLauncherSurface = "panel" | "floating";

export function groupLauncherResults(items: QuickLauncherResultItem[]): QuickLauncherGroups {
  return {
    applications: items.filter((item) => item.kind === "application"),
    settings: items.filter((item) => item.kind === "systemSetting"),
  };
}

export function defaultLauncherSelection(items: QuickLauncherResultItem[]) {
  return items[0]?.id ?? null;
}

export function reconcileLauncherSelection(
  selectedId: string | null,
  items: QuickLauncherResultItem[],
) {
  if (selectedId && items.some((item) => item.id === selectedId)) {
    return selectedId;
  }
  return defaultLauncherSelection(items);
}

export function moveLauncherSelection(
  selectedId: string | null,
  items: QuickLauncherResultItem[],
  direction: -1 | 1,
) {
  if (items.length === 0) {
    return null;
  }
  const currentIndex = items.findIndex((item) => item.id === selectedId);
  const start = currentIndex < 0 ? (direction > 0 ? -1 : 0) : currentIndex;
  const nextIndex = (start + direction + items.length) % items.length;
  return items[nextIndex].id;
}

export function canActivateLauncherItem(
  selectedId: string | null,
  items: QuickLauncherResultItem[],
  activatingId: string | null,
) {
  return activatingId === null &&
    selectedId !== null &&
    items.some((item) => item.id === selectedId);
}

export function shouldDismissLauncher(
  surface: QuickLauncherSurface,
  event: "escape" | "blur" | "activationSuccess",
  activationPending: boolean,
) {
  if (surface === "panel") {
    return false;
  }
  if (event === "blur" && activationPending) {
    return false;
  }
  return true;
}
