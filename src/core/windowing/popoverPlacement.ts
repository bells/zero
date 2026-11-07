export interface PopoverPlacement {
  revision: number;
  anchorX: number | null;
}

export interface PopoverPlacementBridge {
  listen: (accept: (placement: PopoverPlacement) => void) => Promise<() => void>;
  snapshot: () => Promise<PopoverPlacement>;
}

export function observePopoverPlacement(
  bridge: PopoverPlacementBridge,
  onChange: (placement: PopoverPlacement) => void,
): () => void {
  let live = true;
  let revision = -1;
  let stop: (() => void) | undefined;
  const accept = (placement: PopoverPlacement) => {
    if (!live || placement.revision <= revision) return;
    revision = placement.revision;
    onChange(placement);
  };

  // Subscribe first, then recover any placement sent before the window mounted.
  void bridge.listen(accept)
    .then(async (unlisten) => {
      if (!live) {
        unlisten();
        return;
      }
      stop = unlisten;
      accept(await bridge.snapshot());
    })
    .catch(() => undefined);

  return () => {
    live = false;
    stop?.();
  };
}
