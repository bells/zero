export interface PaperSelectionItem {
  id: string;
  startDate: string;
  title: string;
  attribution: string;
}
export interface PaperNavigation<T extends PaperSelectionItem> {
  selected: T | null;
  selectedIndex: number;
  canSelectOlder: boolean;
  canSelectNewer: boolean;
}
export interface PaperSelectionSession {
  open(): void;
  choose(id: string | null): void;
  latest(): void;
  accept(items: readonly PaperSelectionItem[]): string | null;
}

export function sortWallpapers<T extends PaperSelectionItem>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => right.startDate.localeCompare(left.startDate) || left.id.localeCompare(right.id));
}
function resolveSelection(items: readonly PaperSelectionItem[], selectedId: string | null): string | null {
  return items.some(item => item.id === selectedId) ? selectedId : items[0]?.id ?? null;
}
export function navigation<T extends PaperSelectionItem>(items: readonly T[], selectedId: string | null): PaperNavigation<T> {
  const sorted = sortWallpapers(items);
  const resolved = resolveSelection(sorted, selectedId);
  const selectedIndex = resolved === null ? -1 : sorted.findIndex(item => item.id === resolved);
  return {selected: sorted[selectedIndex] ?? null, selectedIndex,
    canSelectOlder: selectedIndex >= 0 && selectedIndex < sorted.length - 1, canSelectNewer: selectedIndex > 0};
}
export function selectOlder(items: readonly PaperSelectionItem[], selectedId: string | null): string | null {
  const sorted = sortWallpapers(items);
  const state = navigation(sorted, selectedId);
  return state.canSelectOlder ? sorted[state.selectedIndex + 1]!.id : state.selected?.id ?? null;
}
export function selectNewer(items: readonly PaperSelectionItem[], selectedId: string | null): string | null {
  const sorted = sortWallpapers(items);
  const state = navigation(sorted, selectedId);
  return state.canSelectNewer ? sorted[state.selectedIndex - 1]!.id : state.selected?.id ?? null;
}
export function displayTitle(item: PaperSelectionItem | null, fallback: string): string {
  return item?.title.trim() || item?.attribution.split(' (')[0]?.trim() || fallback;
}
export function createSelectionSession(): PaperSelectionSession {
  let following = true;
  let selectedId: string | null = null;
  return {
    open() { following = true; selectedId = null; },
    choose(id) { following = false; selectedId = id; },
    latest() { following = true; },
    accept(items) {
      if (!items.some(item => item.id === selectedId)) following = true;
      selectedId = resolveSelection(sortWallpapers(items), following ? null : selectedId);
      return selectedId;
    },
  };
}
