import type { ReactNode } from "react";
import { usePopoverPlacement } from "./usePopoverPlacement";
import "./popover.css";

interface Props {
  children: ReactNode;
  tone: "tray" | "paper";
}

export function AnchoredPopover({ children, tone }: Props) {
  const { anchorX } = usePopoverPlacement();
  const anchored = anchorX !== null && Number.isFinite(anchorX) && anchorX >= 0;

  return (
    <div className={`anchored-popover ${tone}-popover`} data-anchored={anchored}>
      {anchored ? (
        <span
          className="popover-caret"
          aria-hidden="true"
          style={{ left: `clamp(8px, ${anchorX}px, calc(100% - 8px))` }}
        />
      ) : null}
      {children}
    </div>
  );
}
