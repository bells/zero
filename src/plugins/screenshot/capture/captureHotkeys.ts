export type CaptureHotkeyAction =
  | "undo"
  | "redo"
  | "removeSelected"
  | "cancel"
  | null;

export interface KeyboardLikeEvent {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
}

function isModifierPressed(event: KeyboardLikeEvent): boolean {
  return Boolean(event.metaKey || event.ctrlKey);
}

export function resolveCaptureHotkey(event: KeyboardLikeEvent): CaptureHotkeyAction {
  const key = event.key.toLowerCase();

  if (key === "escape") {
    return "cancel";
  }

  if (key === "delete" || key === "backspace") {
    return "removeSelected";
  }

  if (!isModifierPressed(event)) {
    return null;
  }

  if (key === "z" && event.shiftKey) {
    return "redo";
  }

  if (key === "z") {
    return "undo";
  }

  if (key === "y") {
    return "redo";
  }

  return null;
}
