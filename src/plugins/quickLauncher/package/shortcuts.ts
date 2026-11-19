export type LauncherShortcutPlatform = "macos" | "windows" | "unsupported";

interface LauncherShortcutEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  isComposing: boolean;
}

export interface DisplayedLauncherTarget {
  itemId: string;
  revision: number;
  query: string;
}

export function launcherShortcutPlatform(platform: string): LauncherShortcutPlatform {
  if (/Mac/.test(platform)) return "macos";
  if (/Win/.test(platform)) return "windows";
  return "unsupported";
}

export function launcherResultShortcut(index: number, platform: LauncherShortcutPlatform) {
  if (!Number.isInteger(index) || index < 0 || index >= 9 || platform === "unsupported") return null;
  const digit = index + 1;
  return platform === "macos"
    ? { label: `⌘${digit}`, ariaKeyShortcuts: `Meta+${digit}` }
    : { label: `Ctrl+${digit}`, ariaKeyShortcuts: `Control+${digit}` };
}

export function launcherShortcutIndex(event: LauncherShortcutEvent, platform: LauncherShortcutPlatform) {
  if (event.repeat || event.isComposing || event.altKey || event.shiftKey || !/^[1-9]$/.test(event.key)) return null;
  const modifierMatches = platform === "macos"
    ? event.metaKey && !event.ctrlKey
    : platform === "windows" && event.ctrlKey && !event.metaKey;
  return modifierMatches ? Number(event.key) - 1 : null;
}

export function resolveShortcutActivation(
  displayed: DisplayedLauncherTarget,
  latest: { revision: number; query: string; items: ReadonlyArray<{ id: string }> } | null,
  query: string,
  blocked: boolean,
): DisplayedLauncherTarget | null {
  if (blocked || !latest || displayed.query !== query || latest.query !== query
    || latest.revision !== displayed.revision
    || !latest.items.some((item) => item.id === displayed.itemId)) return null;
  return displayed;
}
