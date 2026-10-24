import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  clampCaptureToolbarDragPosition,
  moveCaptureToolbarGroup,
  resolveCaptureToolbarDragBounds,
  type CaptureFloatingCoordinates,
  type CaptureToolbarDragState,
  type CapturePropertySide,
} from "./captureToolbarModel";
import type { Size } from "./captureSelectionModel";
import type { Point } from "./captureTypes";
interface Drag {
  pointerId: number;
  start: Point;
  origin: CaptureFloatingCoordinates;
  previous: CaptureToolbarDragState;
  handle: HTMLButtonElement;
  side: CapturePropertySide;
}
export function useCaptureToolbarDrag(
  sessionId: string | undefined,
  automatic: CaptureFloatingCoordinates,
  toolbarSize: Size,
  reserved: Size,
  viewport: Size,
  automaticSide: CapturePropertySide,
) {
  const [position, setPosition] = useState<CaptureToolbarDragState>({
    mode: "automatic",
  });
  const [dragging, setDragging] = useState(false);
  const positionRef = useRef(position);
  const dragRef = useRef<Drag | null>(null);
  const side = position.mode === "manual" ? position.side : automaticSide;
  const group = resolveCaptureToolbarDragBounds(
    toolbarSize,
    reserved,
    viewport,
    side,
  );
  const commitPosition = useCallback((next: CaptureToolbarDragState) => {
    positionRef.current = next;
    setPosition(next);
  }, []);
  const release = useCallback((drag: Drag) => {
    try {
      if (drag.handle.hasPointerCapture(drag.pointerId))
        drag.handle.releasePointerCapture(drag.pointerId);
    } catch {
      /* A removed handle may have already lost capture. */
    }
  }, []);
  const cancel = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    commitPosition(drag.previous);
    setDragging(false);
    release(drag);
  }, [commitPosition, release]);
  useEffect(() => {
    const keydown = (event: globalThis.KeyboardEvent) => {
      if (!dragRef.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") cancel();
    };
    window.addEventListener("keydown", keydown, true);
    return () => {
      window.removeEventListener("keydown", keydown, true);
      const drag = dragRef.current;
      dragRef.current = null;
      if (drag) release(drag);
    };
  }, [cancel, release]);
  useLayoutEffect(() => {
    cancel();
    commitPosition({ mode: "automatic" });
  }, [sessionId, cancel, commitPosition]);
  useLayoutEffect(() => {
    const current = positionRef.current;
    if (current.mode !== "manual") return;
    const next = clampCaptureToolbarDragPosition(current, group, viewport);
    if (next.left !== current.left || next.top !== current.top)
      commitPosition({ mode: "manual", side: current.side, ...next });
  }, [
    group.x,
    group.y,
    group.width,
    group.height,
    viewport.width,
    viewport.height,
    commitPosition,
  ]);
  const coordinates =
    position.mode === "manual"
      ? clampCaptureToolbarDragPosition(position, group, viewport)
      : automatic;
  const stop = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const handleProps = {
    onPointerDown(event: PointerEvent<HTMLButtonElement>) {
      stop(event);
      if (event.button !== 0 || dragRef.current) return;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        return;
      }
      dragRef.current = {
        pointerId: event.pointerId,
        start: { x: event.clientX, y: event.clientY },
        origin: coordinates,
        previous: positionRef.current,
        handle: event.currentTarget,
        side,
      };
      event.currentTarget.focus({ preventScroll: true });
      setDragging(true);
    },
    onPointerMove(event: PointerEvent<HTMLButtonElement>) {
      stop(event);
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      commitPosition({
        mode: "manual",
        side: drag.side,
        ...moveCaptureToolbarGroup(
          drag.origin,
          drag.start,
          { x: event.clientX, y: event.clientY },
          group,
          viewport,
        ),
      });
    },
    onPointerUp(event: PointerEvent<HTMLButtonElement>) {
      stop(event);
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      commitPosition(
        event.clientX === drag.start.x && event.clientY === drag.start.y
          ? drag.previous
          : {
              mode: "manual",
              side: drag.side,
              ...moveCaptureToolbarGroup(
                drag.origin,
                drag.start,
                { x: event.clientX, y: event.clientY },
                group,
                viewport,
              ),
            },
      );
      dragRef.current = null;
      setDragging(false);
      release(drag);
    },
    onPointerCancel(event: PointerEvent<HTMLButtonElement>) {
      stop(event);
      if (dragRef.current?.pointerId === event.pointerId) cancel();
    },
    onLostPointerCapture(event: PointerEvent<HTMLButtonElement>) {
      event.stopPropagation();
      if (dragRef.current?.pointerId === event.pointerId) cancel();
    },
    onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
      event.stopPropagation();
      if (
        event.nativeEvent.isComposing ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      const delta: Record<string, Point> = {
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
      };
      const direction = delta[event.key];
      if (!direction) return;
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      commitPosition({
        mode: "manual",
        side,
        ...clampCaptureToolbarDragPosition(
          {
            left: coordinates.left + direction.x * step,
            top: coordinates.top + direction.y * step,
          },
          group,
          viewport,
        ),
      });
    },
  };
  return {
    mode: position.mode,
    side,
    coordinates,
    dragging,
    handleProps,
    restore: () => {
      cancel();
      commitPosition({ mode: "automatic" });
    },
  };
}
