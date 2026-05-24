import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Bounds } from "./captureCanvas";
import {
  drawAnnotations,
  hitTestAnnotation,
  isAnnotationLargeEnough,
  normalizeRect,
} from "./captureCanvas";
import {
  canvasToPngDataUrl,
  cropCanvasToPngDataUrl,
  loadImageFromBase64,
  renderFinalCanvas,
} from "./captureExport";
import { resolveCaptureHotkey } from "./captureHotkeys";
import { captureReducer, createId, initialHistoryState } from "./captureReducer";
import {
  buildCommitScreenshotPayload,
  buildPinScreenshotPayload,
} from "./captureSerialize";
import type { AnnotationObject, CaptureSession, CaptureTool, Point } from "./captureTypes";

type DraftAnnotation = AnnotationObject | null;

interface TextDraft {
  x: number;
  y: number;
  screenX: number;
  screenY: number;
  value: string;
}

const tools: Array<{ tool: CaptureTool; label: string }> = [
  { tool: "select", label: "Select" },
  { tool: "rectangle", label: "Rect" },
  { tool: "arrow", label: "Arrow" },
  { tool: "pen", label: "Pen" },
  { tool: "text", label: "Text" },
  { tool: "mosaic", label: "Mosaic" },
  { tool: "pin", label: "Pin" },
];

function toImageSrc(imageBase64: string): string {
  return imageBase64.startsWith("data:")
    ? imageBase64
    : `data:image/png;base64,${imageBase64}`;
}

export function CaptureApp() {
  const [session, setSession] = useState<CaptureSession | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [baseImage, setBaseImage] = useState<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<CaptureTool>("rectangle");
  const [history, dispatch] = useReducer(captureReducer, initialHistoryState);
  const [draft, setDraft] = useState<DraftAnnotation>(null);
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const dragStartRef = useRef<Point | null>(null);
  const draftIdRef = useRef<string | null>(null);
  const draftRef = useRef<DraftAnnotation>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    invoke<CaptureSession>("init_screenshot_session", {})
      .then(async (payload) => {
        const src = toImageSrc(payload.image_base64);
        setSession(payload);
        setImageSrc(src);
        setBaseImage(await loadImageFromBase64(src));
      })
      .catch((err) => setError(String(err)));
  }, []);

  useEffect(() => {
    if (!session || !overlayRef.current) {
      return;
    }

    const overlay = overlayRef.current;
    overlay.width = session.width;
    overlay.height = session.height;
    const ctx = overlay.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, session.width, session.height);
    if (baseImage) {
      ctx.drawImage(baseImage, 0, 0, session.width, session.height);
    }
    drawAnnotations(ctx, draft ? [...history.annotations, draft] : history.annotations);
  }, [baseImage, draft, history.annotations, session]);

  const pointerToImagePoint = useCallback(
    (event: ReactPointerEvent): Point | null => {
      if (!session || !imageRef.current) {
        return null;
      }

      const rect = imageRef.current.getBoundingClientRect();
      const scale = Math.min(rect.width / session.width, rect.height / session.height);
      const renderedWidth = session.width * scale;
      const renderedHeight = session.height * scale;
      const offsetX = rect.left + (rect.width - renderedWidth) / 2;
      const offsetY = rect.top + (rect.height - renderedHeight) / 2;
      const x = (event.clientX - offsetX) / scale;
      const y = (event.clientY - offsetY) / scale;

      if (x < 0 || y < 0 || x > session.width || y > session.height) {
        return null;
      }

      return { x, y };
    },
    [session],
  );

  const updateDraft = useCallback((nextDraft: DraftAnnotation) => {
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  }, []);

  const renderCurrentFinalCanvas = useCallback((): HTMLCanvasElement => {
    if (!session || !baseImage) {
      throw new Error("Capture session is not ready");
    }

    return renderFinalCanvas(baseImage, session.width, session.height, history.annotations);
  }, [baseImage, history.annotations, session]);

  const commitPin = useCallback(
    async (bounds: Bounds) => {
      if (!session) {
        return;
      }

      setError(null);
      try {
        const pngBase64 = cropCanvasToPngDataUrl(renderCurrentFinalCanvas(), bounds);
        if (!pngBase64) {
          return;
        }

        await invoke("pin_screenshot", buildPinScreenshotPayload(session.session_id, pngBase64));
      } catch (err) {
        setError(String(err));
      }
    },
    [renderCurrentFinalCanvas, session],
  );

  const commit = useCallback(
    async (action: "copy" | "save") => {
      if (!session) {
        return;
      }

      setIsCommitting(true);
      setError(null);
      try {
        const pngBase64 = canvasToPngDataUrl(renderCurrentFinalCanvas());
        await invoke(
          "commit_screenshot",
          buildCommitScreenshotPayload({
            sessionId: session.session_id,
            action,
            pngBase64,
          }),
        );
      } catch (err) {
        setError(String(err));
      } finally {
        setIsCommitting(false);
      }
    },
    [renderCurrentFinalCanvas, session],
  );

  const cancel = useCallback(() => {
    if (draft || textDraft) {
      setDraft(null);
      draftRef.current = null;
      setTextDraft(null);
      dragStartRef.current = null;
      draftIdRef.current = null;
      return;
    }

    if (!session) {
      return;
    }

    invoke("cancel_screenshot_session", { sessionId: session.session_id }).catch((err) =>
      setError(String(err)),
    );
  }, [draft, session, textDraft]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      const action = resolveCaptureHotkey(event);
      if (!action) {
        return;
      }

      event.preventDefault();
      if (action === "undo") {
        dispatch({ type: "undo" });
      } else if (action === "redo") {
        dispatch({ type: "redo" });
      } else if (action === "removeSelected") {
        dispatch({ type: "removeSelected" });
      } else if (action === "cancel") {
        cancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cancel]);

  function createDraft(start: Point, point: Point): AnnotationObject {
    const id = draftIdRef.current ?? createId(tool);
    draftIdRef.current = id;

    if (tool === "arrow") {
      return {
        id,
        type: "arrow",
        from: start,
        to: point,
        color: "#55f280",
        strokeWidth: 5,
      };
    }

    if (tool === "pen") {
      const previousDraft = draftRef.current;
      const previousPoints = previousDraft?.type === "pen" ? previousDraft.points : [start];
      return {
        id,
        type: "pen",
        points: [...previousPoints, point],
        color: "#55f280",
        strokeWidth: 5,
      };
    }

    const bounds = normalizeRect(start, point);
    if (tool === "mosaic") {
      return {
        id,
        type: "mosaic",
        ...bounds,
        color: "#55f280",
        strokeWidth: 2,
        pixelSize: 14,
      };
    }

    if (tool === "pin") {
      return {
        id,
        type: "pin",
        ...bounds,
        color: "#55f280",
        strokeWidth: 2,
      };
    }

    return {
      id,
      type: "rectangle",
      ...bounds,
      color: "#55f280",
      strokeWidth: 4,
    };
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = pointerToImagePoint(event);
    if (!point) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setError(null);

    if (tool === "select") {
      const selected = hitTestAnnotation(history.annotations, point);
      dispatch({ type: "select", id: selected?.id ?? null });
      return;
    }

    if (tool === "text") {
      const inputWidth = 176;
      const inputHeight = 42;
      setTextDraft({
        x: point.x,
        y: point.y,
        screenX: Math.min(event.clientX, Math.max(0, window.innerWidth - inputWidth)),
        screenY: Math.min(event.clientY, Math.max(0, window.innerHeight - inputHeight)),
        value: "",
      });
      return;
    }

    dragStartRef.current = point;
    draftIdRef.current = createId(tool);
    updateDraft(createDraft(point, point));
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const start = dragStartRef.current;
    if (!start) {
      return;
    }

    const point = pointerToImagePoint(event);
    if (!point) {
      return;
    }

    updateDraft(createDraft(start, point));
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const start = dragStartRef.current;
    const point = pointerToImagePoint(event);
    const currentDraft = start && point ? createDraft(start, point) : draftRef.current;
    dragStartRef.current = null;
    draftIdRef.current = null;
    draftRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!currentDraft || !isAnnotationLargeEnough(currentDraft)) {
      setDraft(null);
      return;
    }

    updateDraft(null);
    if (currentDraft.type === "pin") {
      void commitPin(currentDraft);
      return;
    }

    dispatch({ type: "add", annotation: currentDraft });
  };

  function commitTextDraft() {
    if (!textDraft || textDraft.value.trim().length === 0) {
      setTextDraft(null);
      return;
    }

    dispatch({
      type: "add",
      annotation: {
        id: createId("text"),
        type: "text",
        x: textDraft.x,
        y: textDraft.y,
        text: textDraft.value.trim(),
        fontSize: 24,
        color: "#55f280",
        strokeWidth: 2,
      },
    });
    setTextDraft(null);
  }

  return (
    <main className="capture-shell">
      {imageSrc ? (
        <img ref={imageRef} className="capture-image" src={imageSrc} alt="" draggable={false} />
      ) : null}
      <canvas
        ref={overlayRef}
        className="capture-overlay"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
      {textDraft ? (
        <input
          className="capture-text-input"
          style={{ left: textDraft.screenX, top: textDraft.screenY }}
          value={textDraft.value}
          autoFocus
          onChange={(event) => setTextDraft({ ...textDraft, value: event.target.value })}
          onBlur={commitTextDraft}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setTextDraft(null);
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
      ) : null}
      {error ? <p className="capture-error">{error}</p> : null}
      <nav className="capture-toolbar-live" aria-label="Capture tools">
        {tools.map((entry) => (
          <button
            type="button"
            className={entry.tool === tool ? "capture-tool-live selected" : "capture-tool-live"}
            key={entry.tool}
            onClick={() => setTool(entry.tool)}
          >
            {entry.label}
          </button>
        ))}
        <span className="capture-divider-live" />
        <button type="button" className="capture-tool-live" onClick={() => dispatch({ type: "undo" })}>
          Undo
        </button>
        <button type="button" className="capture-tool-live" onClick={() => dispatch({ type: "redo" })}>
          Redo
        </button>
        <button
          type="button"
          className="capture-tool-live danger"
          onClick={() => dispatch({ type: "removeSelected" })}
        >
          Del
        </button>
        <span className="capture-divider-live" />
        <button type="button" className="capture-tool-live danger" onClick={cancel}>
          Esc
        </button>
        <button
          type="button"
          className="capture-tool-live"
          disabled={isCommitting}
          onClick={() => commit("save")}
        >
          Save
        </button>
        <button
          type="button"
          className="capture-tool-live confirm"
          disabled={isCommitting}
          onClick={() => commit("copy")}
        >
          Copy
        </button>
      </nav>
    </main>
  );
}

export default CaptureApp;
