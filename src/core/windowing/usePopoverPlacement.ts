import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { observePopoverPlacement, type PopoverPlacement } from "./popoverPlacement";

export function usePopoverPlacement(): PopoverPlacement {
  const [placement, setPlacement] = useState<PopoverPlacement>({ revision: -1, anchorX: null });

  useEffect(() => observePopoverPlacement({
    listen: (accept) => getCurrentWindow().listen<PopoverPlacement>(
      "zero://popover-placement",
      ({ payload }) => accept(payload),
    ),
    snapshot: () => invoke<PopoverPlacement>("get_popover_placement"),
  }, setPlacement), []);

  return placement;
}
