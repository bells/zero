export const NATIVE_MENU_EDIT_EVENT = "zero://native-menu-edit";
export const EDITOR_MENU_EDIT_EVENT = "zero:native-menu-edit";

export type NativeMenuEditAction = "undo" | "redo";

export interface NativeMenuEditPayload {
  action: NativeMenuEditAction;
}

export function isTextEditingElement(element: Element | null): boolean {
  return element?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])") != null;
}

export function dispatchNativeMenuEdit(
  payload: unknown,
  target: Pick<Document, "dispatchEvent" | "execCommand"> = document,
): void {
  if (typeof payload !== "object" || payload === null || !("action" in payload)) return;
  const { action } = payload;
  if (action !== "undo" && action !== "redo") return;
  const event = new CustomEvent<NativeMenuEditPayload>(EDITOR_MENU_EDIT_EVENT, {
    detail: { action },
    cancelable: true,
  });
  if (target.dispatchEvent(event)) {
    // WebKit keeps text history in its native editing stack.
    target.execCommand(action);
  }
}
