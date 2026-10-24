import { GripHorizontal } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
export function CaptureToolbarPositionControls({
  moveLabel,
  disabled,
  handleProps,
  onRestore,
}: {
  moveLabel: string;
  disabled?: boolean;
  handleProps: ButtonHTMLAttributes<HTMLButtonElement>;
  onRestore: () => void;
}) {
  return (
    <div
      className="capture-toolbar-position-controls"
      data-annotation-edit-domain="true"
    >
      <button
        type="button"
        className="capture-toolbar-drag"
        aria-label={moveLabel}
        title={moveLabel}
        disabled={disabled}
        {...handleProps}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onRestore();
        }}
        onKeyDown={(event) => {
          handleProps.onKeyDown?.(event);
          if (
            !event.defaultPrevented &&
            !event.nativeEvent.isComposing &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.altKey &&
            (event.key === "Enter" || event.key === " ")
          ) {
            event.preventDefault();
            onRestore();
          }
        }}
      >
        <GripHorizontal size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
