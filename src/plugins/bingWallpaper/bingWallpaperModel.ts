import type { BingWallpaperItem } from "./contracts.js";

export interface BingWallpaperNavigationState {
  selected: BingWallpaperItem | null;
  selectedIndex: number;
  canSelectOlder: boolean;
  canSelectNewer: boolean;
}

export function sortBingWallpapers(items: readonly BingWallpaperItem[]) {
  return [...items].sort((left, right) =>
    right.startDate.localeCompare(left.startDate) || left.id.localeCompare(right.id));
}

export function resolveBingWallpaperSelection(
  items: readonly BingWallpaperItem[],
  selectedId: string | null,
) {
  const sorted = sortBingWallpapers(items);
  if (sorted.length === 0) {
    return null;
  }
  return sorted.some((item) => item.id === selectedId) ? selectedId : sorted[0].id;
}

export function createBingWallpaperNavigation(
  items: readonly BingWallpaperItem[],
  selectedId: string | null,
): BingWallpaperNavigationState {
  const sorted = sortBingWallpapers(items);
  const resolvedId = resolveBingWallpaperSelection(sorted, selectedId);
  const selectedIndex = resolvedId
    ? sorted.findIndex((item) => item.id === resolvedId)
    : -1;

  return {
    selected: selectedIndex >= 0 ? sorted[selectedIndex] : null,
    selectedIndex,
    canSelectOlder: selectedIndex >= 0 && selectedIndex < sorted.length - 1,
    canSelectNewer: selectedIndex > 0,
  };
}

export function selectOlderBingWallpaper(
  items: readonly BingWallpaperItem[],
  selectedId: string | null,
) {
  const sorted = sortBingWallpapers(items);
  const navigation = createBingWallpaperNavigation(sorted, selectedId);
  return navigation.canSelectOlder
    ? sorted[navigation.selectedIndex + 1].id
    : navigation.selected?.id ?? null;
}

export function selectNewerBingWallpaper(
  items: readonly BingWallpaperItem[],
  selectedId: string | null,
) {
  const sorted = sortBingWallpapers(items);
  const navigation = createBingWallpaperNavigation(sorted, selectedId);
  return navigation.canSelectNewer
    ? sorted[navigation.selectedIndex - 1].id
    : navigation.selected?.id ?? null;
}

export function bingWallpaperDisplayTitle(
  item: BingWallpaperItem | null,
  fallback: string,
) {
  const title = item?.title.trim();
  if (title) {
    return title;
  }
  const attributionTitle = item?.attribution.split(" (")[0]?.trim();
  return attributionTitle || fallback;
}

export function createPaperSelectionSession() {
  let following = true;
  let selectedId: string | null = null;
  return {
    open() { following = true; selectedId = null; },
    choose(id: string | null) { following = false; selectedId = id; },
    latest() { following = true; },
    accept(items: readonly BingWallpaperItem[]) {
      if (!items.some(item => item.id === selectedId)) following = true;
      selectedId = resolveBingWallpaperSelection(items, following ? null : selectedId);
      return selectedId;
    },
  };
}

export function acceptPaperRuntime(
  current: import("./contracts.js").PaperRuntimeSnapshot | null,
  incoming: import("./contracts.js").PaperRuntimeSnapshot,
) {
  return current && current.revision > incoming.revision ? current : incoming;
}
