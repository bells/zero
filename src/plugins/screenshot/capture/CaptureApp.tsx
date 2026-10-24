import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useCapturePropertyAnchor } from "./useCapturePropertyAnchor";
import { useCaptureToolbarDrag } from "./useCaptureToolbarDrag";
import { CaptureToolbarPositionControls } from "./CaptureToolbarPositionControls";
import { CapturePropertyMeasurements } from "./CapturePropertyMeasurements";
import { invoke } from "@tauri-apps/api/core";
import {
  normalizeOcrError,
  type OcrCapability,
} from "../../../core/ocr/contracts";
import {
  Check,
  Circle,
  Download,
  Grid3X3,
  MousePointer2,
  MoveUpRight,
  Pencil,
  Pin,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Bounds } from "./captureCanvas";
import {
  AnnotationRenderResources,
  drawAnnotations,
  isAnnotationLargeEnough,
  normalizeRect,
} from "./captureCanvas";
import {
  cropCanvasToPngBytes,
  loadImageFromObjectUrl,
  releaseCanvas,
  releaseDecodedImage,
  releaseObjectUrl,
  renderFinalCanvas,
} from "./captureExport";
import { resolveCaptureHotkey } from "./captureHotkeys";
import {
  captureReducer,
  createId,
  initialHistoryState,
} from "./captureReducer";
import {
  CAPTURE_SELECTION_HANDLES,
  imageBoundsToViewportBounds,
  isPointInBounds,
  moveSelectionBy,
  resolveSelectPointerTarget,
  resolveSelectionPointerMode,
  resolveSelectionDrag,
  resolveSelectionNudge,
  resolveSelectionResize,
  viewportPointToImagePoint,
  type SelectionResizeHandle,
  type Size,
} from "./captureSelectionModel";
import {
  MINIMUM_SELECTION_DIMENSION,
  normalizeSelectionGeometry,
  selectionGeometryFromBounds,
  type SelectionGeometry,
} from "./captureGeometryModel";
import {
  hasExceededTargetDragThreshold,
  normalizeScreenshotTargets,
  resolveScreenshotTargetAtPoint,
  resolveStableTargetClick,
  type ResolvedScreenshotTarget,
} from "./captureTargetModel";
import { SelectionGeometryControls } from "./SelectionGeometryControls";
import {
  buildPrepareScreenshotCommitPayload,
  buildScreenshotUploadOptions,
} from "./captureSerialize";
import {
  resolveCaptureToolbarPosition,
  capturePropertySide,
  resolveCapturePropertyPosition,
  type CaptureToolbarPosition,
} from "./captureToolbarModel";
import type {
  AnnotationObject,
  CaptureSession,
  CaptureTool,
  DrawingAnnotation,
  TextAnnotation,
  Point,
  ScreenshotCommitResult,
  ScreenshotError,
  ScreenshotUploadLease,
} from "./captureTypes";
import { resolveLanguage } from "../../../core/preferences/i18n";
import { normalizePreferences } from "../../../core/preferences/preferencesModel";
import { readStoredPreferences } from "../../../core/preferences/preferencesStorage";
import {
  createCaptureTranslator,
  type CaptureTranslationKey as TranslationKey,
} from "./i18n";

import {
  AnnotationPropertiesPanel,
  type AnnotationPanelContext,
} from "./AnnotationPropertiesPanel";
import {
  annotationStyle,
  isDrawingTool,
  normalizeAnnotation,
  patchAnnotationStyle,
} from "./captureAnnotationProperties";
import {
  annotationBounds,
  annotationBoundsToViewport,
  annotationHandles,
  hitAnnotationHandle,
  hitTestAnnotation,
  moveAnnotation,
  resizeAnnotation,
  moveArrowEndpoint,
  textFont,
  textLayout,
  releaseTextMeasurement,
  type ObjectHandle,
} from "./captureAnnotationGeometry";
import { useCaptureAnnotationEditing } from "./useCaptureAnnotationEditing";
import { useCaptureToolDefaults } from "./useCaptureToolDefaults";

type DraftAnnotation = AnnotationObject | null;

interface TextDraft {
  mode: "create" | "edit";
  annotation: TextAnnotation;
  token?: number;
  screenX: number;
  screenY: number;
  value: string;
}
interface ObjectPointerInteraction {
  pointerId: number;
  start: Point;
  startViewport: Point;
  original: DrawingAnnotation;
  token: number;
  handle: ObjectHandle | null;
  moved: boolean;
}
type PropertyInteraction =
  | { kind: "default" }
  | { kind: "selected"; token: number }
  | { kind: "text"; snapshot: TextDraft };

interface CaptureToolDescriptor {
  tool: CaptureTool;
  labelKey: TranslationKey;
  Icon: LucideIcon;
}

type SelectionPointerInteraction =
  | {
      kind: "pending-target";
      pointerId: number;
      start: Point;
      startViewport: Point;
      target: ResolvedScreenshotTarget | null;
    }
  | {
      kind: "create" | "move";
      pointerId: number;
      start: Point;
      initial: SelectionGeometry;
    }
  | {
      kind: "resize";
      pointerId: number;
      start: Point;
      initial: SelectionGeometry;
      handle: SelectionResizeHandle;
    };

const tools: CaptureToolDescriptor[] = [
  {
    tool: "select",
    labelKey: "screenshot.toolbar.select",
    Icon: MousePointer2,
  },
  { tool: "rectangle", labelKey: "screenshot.toolbar.rectangle", Icon: Square },
  { tool: "ellipse", labelKey: "screenshot.toolbar.ellipse", Icon: Circle },
  { tool: "arrow", labelKey: "screenshot.toolbar.arrow", Icon: MoveUpRight },
  { tool: "pen", labelKey: "screenshot.toolbar.pen", Icon: Pencil },
  { tool: "text", labelKey: "screenshot.toolbar.text", Icon: Type },
  { tool: "mosaic", labelKey: "screenshot.toolbar.mosaic", Icon: Grid3X3 },
  { tool: "pin", labelKey: "screenshot.toolbar.pin", Icon: Pin },
];

const TEXT_INPUT_WIDTH = 220;
const TEXT_INPUT_HEIGHT = 96;

function roundedRectanglePath(bounds: Bounds, radius: number): string {
  const { x, y, width, height } = bounds;
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  const right = x + width;
  const bottom = y + height;
  return [
    `M ${x + safeRadius} ${y}`,
    `H ${right - safeRadius}`,
    `Q ${right} ${y} ${right} ${y + safeRadius}`,
    `V ${bottom - safeRadius}`,
    `Q ${right} ${bottom} ${right - safeRadius} ${bottom}`,
    `H ${x + safeRadius}`,
    `Q ${x} ${bottom} ${x} ${bottom - safeRadius}`,
    `V ${y + safeRadius}`,
    `Q ${x} ${y} ${x + safeRadius} ${y}`,
    "Z",
  ].join(" ");
}

function screenshotErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as ScreenshotError).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return String(error);
}

export function CaptureApp() {
  const preferences = normalizePreferences(
    readStoredPreferences(window.localStorage),
    [],
  );
  const language = resolveLanguage(preferences.language, navigator.language);
  const t = useMemo(() => createCaptureTranslator(language), [language]);
  const [session, setSession] = useState<CaptureSession | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [baseImage, setBaseImage] = useState<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<CaptureTool>("select");
  const [selection, setSelection] = useState<SelectionGeometry | null>(null);
  const [selectionCursor, setSelectionCursor] = useState<
    "default" | "grab" | "grabbing"
  >("default");
  const [selectionDraft, setSelectionDraft] =
    useState<SelectionGeometry | null>(null);
  const [hoverTarget, setHoverTarget] =
    useState<ResolvedScreenshotTarget | null>(null);
  const [crosshair, setCrosshair] = useState<Point | null>(null);
  const [viewportSize, setViewportSize] = useState<Size>(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const [toolbarSize, setToolbarSize] = useState<Size | null>(null);
  const [geometryControlBounds, setGeometryControlBounds] =
    useState<Bounds | null>(null);
  const [history, dispatch] = useReducer(captureReducer, initialHistoryState);
  const editing = useCaptureAnnotationEditing(history.annotations, dispatch);
  const defaults = useCaptureToolDefaults();
  const propertyInteractionRef = useRef<PropertyInteraction | null>(null);
  const objectInteractionRef = useRef<ObjectPointerInteraction | null>(null);
  const drawingPointerRef = useRef<number | null>(null);
  const renderResources = useRef(new AnnotationRenderResources());
  const compositionRef = useRef(false);
  const closingRef = useRef(false);
  const [propertyActive, setPropertyActive] = useState(false);
  const [propertyRevision, setPropertyRevision] = useState(0);
  const [renderFailed, setRenderFailed] = useState(false);
  const [propertyReservation, setPropertyReservation] = useState<{
    key: string;
    size: Size;
  } | null>(null);
  const measurementKey = `${viewportSize.width}:${viewportSize.height}:${language}`;
  const measureProperties = useCallback(
    (size: Size) => {
      setPropertyReservation((current) =>
        current?.key === measurementKey &&
        current.size.width === size.width &&
        current.size.height === size.height
          ? current
          : { key: measurementKey, size },
      );
    },
    [measurementKey],
  );
  const [draft, setDraft] = useState<DraftAnnotation>(null);
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [ocrAvailable, setOcrAvailable] = useState(false);
  const dragStartRef = useRef<Point | null>(null);
  const selectionInteractionRef = useRef<SelectionPointerInteraction | null>(
    null,
  );
  const draftIdRef = useRef<string | null>(null);
  const draftRef = useRef<DraftAnnotation>(null);
  const textDraftRef = useRef<TextDraft | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const propertyPanelRef = useRef<HTMLDivElement | null>(null);
  const revealedSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    let disposed = false;
    void invoke<OcrCapability>("get_ocr_capability")
      .then((capability) => {
        if (!disposed) setOcrAvailable(capability.available);
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let objectUrl: string | null = null;
    let decodedImage: HTMLImageElement | null = null;
    let receivedBytes: Uint8Array | null = null;
    let initializedSessionId: string | null = null;

    void (async () => {
      try {
        const payload = await invoke<CaptureSession>(
          "init_screenshot_session",
          {},
        );
        initializedSessionId = payload.sessionId;
        const value = await invoke<ArrayBuffer>("read_screenshot_media", {
          input: { token: payload.media.token },
        });
        receivedBytes = new Uint8Array(value);
        if (
          receivedBytes.byteLength === 0 ||
          receivedBytes.byteLength !== payload.media.byteLength
        ) {
          throw new Error(
            "The screenshot resource size does not match its descriptor",
          );
        }
        objectUrl = URL.createObjectURL(
          new Blob([value], { type: payload.media.mimeType }),
        );
        decodedImage = await loadImageFromObjectUrl(objectUrl);
        if (disposed) {
          releaseDecodedImage(decodedImage);
          decodedImage = null;
          objectUrl = releaseObjectUrl(objectUrl);
          return;
        }
        setSession(payload);
        setSelection(null);
        setImageSrc(objectUrl);
        setBaseImage(decodedImage);
      } catch (error) {
        releaseDecodedImage(decodedImage);
        decodedImage = null;
        objectUrl = releaseObjectUrl(objectUrl);
        if (!disposed) {
          setError(screenshotErrorMessage(error));
          if (initializedSessionId) {
            await invoke("cancel_screenshot_session", {
              sessionId: initializedSessionId,
            }).catch(() => undefined);
          }
        }
      } finally {
        receivedBytes?.fill(0);
        receivedBytes = null;
      }
    })();

    return () => {
      disposed = true;
      releaseDecodedImage(decodedImage);
      objectUrl = releaseObjectUrl(objectUrl);
    };
  }, []);

  useLayoutEffect(() => {
    if (!session || !imageSrc || !baseImage) {
      return;
    }
    if (revealedSessionIdRef.current === session.sessionId) {
      return;
    }
    const imageElement = imageRef.current;
    if (!imageElement) {
      return;
    }
    let cancelled = false;

    void (async () => {
      try {
        await imageElement.decode();
        if (cancelled || revealedSessionIdRef.current === session.sessionId) {
          return;
        }
        revealedSessionIdRef.current = session.sessionId;

        // Force layout after the displayed image itself has decoded. Native reveal is
        // queued onto AppKit's main thread, so no empty WebView frame is exposed.
        void document.documentElement.offsetWidth;
        await invoke("reveal_screenshot_capture", {
          sessionId: session.sessionId,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setError(screenshotErrorMessage(error));
        await invoke("cancel_screenshot_session", {
          sessionId: session.sessionId,
        }).catch(() => undefined);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [baseImage, imageSrc, session]);

  useLayoutEffect(() => {
    const input = textInputRef.current;
    if (!input) {
      return;
    }

    const focusFrame = requestAnimationFrame(() => {
      input.focus({ preventScroll: true });
      input.setSelectionRange(input.value.length, input.value.length);
    });
    return () => cancelAnimationFrame(focusFrame);
  }, [textDraft?.screenX, textDraft?.screenY]);

  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) {
      return;
    }

    const updateToolbarSize = () => {
      const rect = toolbar.getBoundingClientRect();
      const next = { width: rect.width, height: rect.height };
      setToolbarSize((current) =>
        current?.width === next.width && current.height === next.height
          ? current
          : next,
      );
    };
    const updateViewportSize = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };

    const observer = new ResizeObserver(updateToolbarSize);
    observer.observe(toolbar);
    window.addEventListener("resize", updateViewportSize);
    updateToolbarSize();
    updateViewportSize();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateViewportSize);
    };
  }, [selection]);

  const imageSize = useMemo<Size>(
    () => ({
      width: session?.media.width ?? 0,
      height: session?.media.height ?? 0,
    }),
    [session?.media.height, session?.media.width],
  );
  const targets = useMemo(
    () => normalizeScreenshotTargets(session?.targets ?? [], imageSize),
    [imageSize, session?.targets],
  );
  const activeGeometry = selectionDraft ?? selection;
  const activeSelection = activeGeometry?.bounds ?? null;
  const selectionViewportBounds = useMemo(() => {
    if (!session || !activeSelection) {
      return null;
    }
    return imageBoundsToViewportBounds(
      activeSelection,
      { width: session.media.width, height: session.media.height },
      viewportSize,
    );
  }, [activeSelection, session, viewportSize]);

  const imageViewportBounds = useMemo(() => {
    if (!session) {
      return null;
    }
    return imageBoundsToViewportBounds(
      { x: 0, y: 0, width: session.media.width, height: session.media.height },
      imageSize,
      viewportSize,
    );
  }, [imageSize, session, viewportSize]);

  const hoverViewportBounds = useMemo(() => {
    if (!hoverTarget || !session) {
      return null;
    }
    return imageBoundsToViewportBounds(
      hoverTarget.bounds,
      imageSize,
      viewportSize,
    );
  }, [hoverTarget, imageSize, session, viewportSize]);

  const automaticToolbarPosition: CaptureToolbarPosition | null =
    useMemo(() => {
      if (
        !selectionViewportBounds ||
        !toolbarSize ||
        propertyReservation?.key !== measurementKey
      ) {
        return null;
      }
      return resolveCaptureToolbarPosition(
        selectionViewportBounds,
        toolbarSize,
        viewportSize,
        propertyReservation.size,
        geometryControlBounds,
      );
    }, [
      selectionViewportBounds,
      toolbarSize,
      viewportSize,
      propertyReservation,
      measurementKey,
      geometryControlBounds,
    ]);
  const propertyObject = editing.scene.find(
    (annotation): annotation is DrawingAnnotation =>
      annotation.id === history.selectedId &&
      annotation.type !== "pin" &&
      (tool === "select" || annotation.type === tool),
  );
  const selectedObject = tool === "select" ? propertyObject : undefined;
  const panelContext: AnnotationPanelContext | null = textDraft
    ? {
        mode: textDraft.mode === "edit" ? "selected" : "default",
        tool: "text",
        style: annotationStyle(textDraft.annotation),
      }
    : propertyObject
      ? {
          mode: "selected",
          tool: propertyObject.type,
          style: annotationStyle(propertyObject),
          radiusMaximum:
            propertyObject.type === "rectangle"
              ? Math.min(
                  100,
                  Math.floor(
                    Math.min(propertyObject.width, propertyObject.height) / 2,
                  ),
                )
              : undefined,
        }
      : isDrawingTool(tool)
        ? { mode: "default", tool, style: defaults.styles[tool] }
        : null;
  const propertyPanelKey = `${panelContext?.mode}:${panelContext?.tool}:${history.selectedId ?? "default"}:${propertyRevision}`;
  const propertyMeasurement = useCapturePropertyAnchor(
    toolbarRef,
    propertyPanelRef,
    panelContext?.tool,
    viewportSize,
    propertyPanelKey,
  );
  const toolbarDrag = useCaptureToolbarDrag(
    session?.sessionId,
    automaticToolbarPosition ?? { left: 0, top: 0 },
    toolbarSize ?? { width: 0, height: 0 },
    propertyReservation?.size ?? { width: 0, height: 0 },
    viewportSize,
    automaticToolbarPosition
      ? capturePropertySide(automaticToolbarPosition)
      : "above",
  );
  const toolbarPosition = useMemo<CaptureToolbarPosition | null>(
    () =>
      automaticToolbarPosition
        ? {
            ...toolbarDrag.coordinates,
            placement:
              toolbarDrag.mode === "automatic"
                ? automaticToolbarPosition.placement
                : toolbarDrag.side === "below"
                  ? "outside-bottom"
                  : "inside-bottom",
          }
        : null,
    [
      automaticToolbarPosition,
      toolbarDrag.coordinates.left,
      toolbarDrag.coordinates.top,
      toolbarDrag.mode,
      toolbarDrag.side,
    ],
  );
  const propertyAnchor =
    toolbarPosition && toolbarSize
      ? {
          ...resolveCapturePropertyPosition(
            { x: toolbarPosition.left, y: toolbarPosition.top, ...toolbarSize },
            propertyMeasurement.size,
            viewportSize,
            toolbarDrag.side,
            toolbarPosition.left + propertyMeasurement.buttonOffset,
          ),
          visible: propertyMeasurement.visible,
          ready: propertyMeasurement.ready,
        }
      : {
          left: 0,
          top: 0,
          caretLeft: 0,
          maxHeight: 0,
          visible: false,
          ready: false,
        };
  const sourceScale = imageViewportBounds
    ? imageViewportBounds.width / imageSize.width
    : 1;
  const editBusy = Boolean(
    draft ||
    textDraft ||
    selectionDraft ||
    selectionInteractionRef.current ||
    objectInteractionRef.current ||
    editing.active ||
    defaults.active ||
    propertyActive ||
    toolbarDrag.dragging,
  );
  const pointerBusy = Boolean(
    toolbarDrag.dragging ||
    drawingPointerRef.current !== null ||
    objectInteractionRef.current ||
    selectionInteractionRef.current,
  );

  useEffect(() => {
    if (!session || !overlayRef.current) return;
    const frame = requestAnimationFrame(() => {
      const overlay = overlayRef.current;
      if (!overlay) return;
      if (
        overlay.width !== session.media.width ||
        overlay.height !== session.media.height
      ) {
        overlay.width = session.media.width;
        overlay.height = session.media.height;
      }
      const ctx = overlay.getContext("2d");
      if (!ctx) {
        setRenderFailed(true);
        return;
      }
      try {
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        if (baseImage)
          ctx.drawImage(baseImage, 0, 0, overlay.width, overlay.height);
        const scene =
          textDraft?.mode === "edit"
            ? editing.scene.filter((a) => a.id !== textDraft.annotation.id)
            : editing.scene;
        drawAnnotations(
          ctx,
          draft ? [...scene, draft] : scene,
          renderResources.current,
        );
        setRenderFailed(false);
      } catch {
        setRenderFailed(true);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [baseImage, draft, editing.scene, session, textDraft]);

  useEffect(() => {
    closingRef.current = false;
    return () => {
      closingRef.current = true;
      objectInteractionRef.current = null;
      drawingPointerRef.current = null;
      propertyInteractionRef.current = null;
      textDraftRef.current = null;
      draftRef.current = null;
      renderResources.current.release();
      releaseTextMeasurement();
      releaseCanvas(overlayRef.current);
    };
  }, []);

  const pointerToImagePoint = useCallback(
    (event: ReactPointerEvent, clampToImage = false): Point | null => {
      if (!session || !imageRef.current) {
        return null;
      }

      const rect = imageRef.current.getBoundingClientRect();
      return viewportPointToImagePoint(
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        { width: session.media.width, height: session.media.height },
        { width: rect.width, height: rect.height },
        clampToImage,
      );
    },
    [session],
  );

  const updateDraft = useCallback((nextDraft: DraftAnnotation) => {
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  }, []);

  const updateTextDraft = useCallback((nextDraft: TextDraft | null) => {
    textDraftRef.current = nextDraft;
    if (!nextDraft) compositionRef.current = false;
    setTextDraft(nextDraft);
  }, []);

  const recognizeSelection = useCallback(async () => {
    if (!session || !selection || isCommitting || editBusy) return;
    setIsCommitting(true);
    setError(null);
    try {
      await invoke("start_snap_ocr", {
        input: {
          sessionId: session.sessionId,
          selection: selection.bounds,
          languages: [],
        },
      });
    } catch (reason) {
      setError(t(`ocr.error.${normalizeOcrError(reason)}`));
    } finally {
      setIsCommitting(false);
    }
  }, [session, selection, isCommitting, editBusy, t]);

  const renderCurrentFinalCanvas = useCallback((): HTMLCanvasElement => {
    if (!session || !baseImage) {
      throw new Error("Capture session is not ready");
    }

    return renderFinalCanvas(
      baseImage,
      session.media.width,
      session.media.height,
      history.annotations,
    );
  }, [baseImage, history.annotations, session]);

  const uploadSelection = useCallback(
    async (
      action: "copy" | "save" | "pin",
      geometry: SelectionGeometry,
    ): Promise<ScreenshotCommitResult> => {
      if (!session) {
        throw new Error("Capture session is not ready");
      }
      const lease = await invoke<ScreenshotUploadLease>(
        "prepare_screenshot_commit",
        buildPrepareScreenshotCommitPayload(session.sessionId, action),
      );
      let sourceCanvas: HTMLCanvasElement | null = null;
      let pngBytes: Uint8Array | null = null;
      try {
        sourceCanvas = renderCurrentFinalCanvas();
        pngBytes = await cropCanvasToPngBytes(
          sourceCanvas,
          geometry.bounds,
          geometry.cornerRadius,
        );
        if (!pngBytes) {
          throw new Error("Screenshot selection is outside the captured image");
        }
        if (pngBytes.byteLength === 0 || pngBytes.byteLength > lease.maxBytes) {
          throw new Error("Screenshot PNG exceeds the approved upload size");
        }
        return await invoke<ScreenshotCommitResult>(
          "upload_screenshot_commit",
          pngBytes,
          buildScreenshotUploadOptions(lease),
        );
      } finally {
        pngBytes?.fill(0);
        releaseCanvas(sourceCanvas);
      }
    },
    [renderCurrentFinalCanvas, session],
  );

  const commitPin = useCallback(
    async (geometry: SelectionGeometry) => {
      if (closingRef.current) return;
      setIsCommitting(true);
      setError(null);
      try {
        await uploadSelection("pin", geometry);
      } catch (error) {
        setError(screenshotErrorMessage(error));
      } finally {
        setIsCommitting(false);
      }
    },
    [uploadSelection],
  );

  const commit = useCallback(
    async (action: "copy" | "save") => {
      if (!session || !selection || editBusy || renderFailed || isCommitting) {
        return;
      }

      setIsCommitting(true);
      setError(null);
      try {
        await uploadSelection(action, selection);
      } catch (error) {
        setError(screenshotErrorMessage(error));
      } finally {
        setIsCommitting(false);
      }
    },
    [selection, session, uploadSelection, editBusy, renderFailed, isCommitting],
  );

  function cancelProperty() {
    const interaction = propertyInteractionRef.current;
    propertyInteractionRef.current = null;
    setPropertyActive(false);
    if (interaction) setPropertyRevision((revision) => revision + 1);
    if (interaction?.kind === "default") defaults.cancel();
    else if (interaction?.kind === "selected") editing.cancel();
    else if (interaction?.kind === "text") {
      updateTextDraft(interaction.snapshot);
      if (interaction.snapshot.mode === "create") defaults.cancel();
    }
  }
  function finishProperty() {
    const interaction = propertyInteractionRef.current;
    propertyInteractionRef.current = null;
    setPropertyActive(false);
    if (interaction?.kind === "default") defaults.commit();
    else if (interaction?.kind === "selected")
      editing.commit(interaction.token);
    else if (
      interaction?.kind === "text" &&
      interaction.snapshot.mode === "create"
    )
      defaults.commit();
  }
  function beginProperty() {
    finishProperty();
    const text = textDraftRef.current;
    if (text) {
      propertyInteractionRef.current = {
        kind: "text",
        snapshot: structuredClone(text),
      };
      if (text.mode === "create") defaults.begin("text");
    } else if (propertyObject) {
      propertyInteractionRef.current = {
        kind: "selected",
        token: editing.begin(propertyObject, "property"),
      };
    } else if (isDrawingTool(tool)) {
      defaults.begin(tool);
      propertyInteractionRef.current = { kind: "default" };
    }
    setPropertyActive(true);
  }
  function previewProperty(patch: Record<string, unknown>) {
    const text = textDraftRef.current;
    if (text) {
      updateTextDraft({
        ...text,
        annotation: patchAnnotationStyle(text.annotation, patch),
      });
      if (text.mode === "create") defaults.patch("text", patch);
      return;
    }
    const interaction = propertyInteractionRef.current;
    const transaction = editing.peek();
    if (interaction?.kind === "selected" && transaction)
      editing.preview(
        interaction.token,
        patchAnnotationStyle(transaction.preview, patch),
      );
    else if (interaction?.kind === "default" && isDrawingTool(tool))
      defaults.patch(tool, patch);
  }
  function rollbackGesture() {
    objectInteractionRef.current = null;
    drawingPointerRef.current = null;
    editing.cancel();
    updateDraft(null);
    dragStartRef.current = null;
    draftIdRef.current = null;
    selectionInteractionRef.current = null;
    setSelectionDraft(null);
    setCrosshair(null);
    setHoverTarget(null);
    setSelectionCursor("default");
  }
  function cancelLayer() {
    if (propertyInteractionRef.current) {
      cancelProperty();
      return;
    }
    if (textDraftRef.current) {
      updateTextDraft(null);
      editing.cancel();
      return;
    }
    if (
      draftRef.current ||
      drawingPointerRef.current !== null ||
      objectInteractionRef.current ||
      selectionInteractionRef.current
    ) {
      rollbackGesture();
      return;
    }
    if (history.selectedId) {
      dispatch({ type: "select", id: null });
      return;
    }
    closeSession();
  }
  function closeSession() {
    closingRef.current = true;
    cancelProperty();
    rollbackGesture();
    updateTextDraft(null);
    if (session)
      void invoke("cancel_screenshot_session", {
        sessionId: session.sessionId,
      }).catch((error) => {
        closingRef.current = false;
        setError(screenshotErrorMessage(error));
      });
  }
  function changeTool(next: CaptureTool) {
    if (pointerBusy || isCommitting) return;
    finishProperty();
    if (textDraftRef.current) commitTextDraft();
    dispatch({ type: "select", id: null });
    setTool(next);
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || compositionRef.current) return;
      const target = event.target;
      const editableTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      const selectionDelta = resolveSelectionNudge({
        key: event.key,
        selectToolActive: tool === "select",
        editableTarget,
        composing: event.isComposing || Boolean(textDraftRef.current),
        pointerActive: Boolean(
          selectionInteractionRef.current ||
          objectInteractionRef.current ||
          editing.active ||
          propertyActive ||
          history.selectedId,
        ),
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        repeat: event.repeat,
      });
      if (selectionDelta && session) {
        event.preventDefault();
        setSelection((current) =>
          current
            ? normalizeSelectionGeometry(
                {
                  ...current,
                  bounds: moveSelectionBy(
                    current.bounds,
                    selectionDelta,
                    imageSize,
                  ),
                },
                imageSize,
              )
            : current,
        );
        return;
      }

      if (editableTarget) return;

      const action = resolveCaptureHotkey(event);
      if (!action) {
        return;
      }

      event.preventDefault();
      if (action !== "cancel" && editBusy) return;
      if (action === "undo") {
        dispatch({ type: "undo" });
      } else if (action === "redo") {
        dispatch({ type: "redo" });
      } else if (action === "removeSelected") {
        dispatch({ type: "removeSelected" });
      } else if (action === "cancel") {
        cancelLayer();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  function createDraft(start: Point, point: Point): AnnotationObject {
    const id = draftIdRef.current ?? createId(tool);
    draftIdRef.current = id;
    if (tool === "arrow")
      return {
        id,
        type: "arrow",
        from: start,
        to: point,
        ...defaults.styles.arrow,
        opacity: defaults.styles.arrow.opacity / 100,
      };
    if (tool === "pen") {
      const previous = draftRef.current;
      return {
        id,
        type: "pen",
        points: [
          ...(previous?.type === "pen" ? previous.points : [start]),
          point,
        ],
        ...defaults.styles.pen,
        opacity: defaults.styles.pen.opacity / 100,
      };
    }
    const bounds = normalizeRect(start, point);
    if (tool === "ellipse")
      return {
        id,
        type: "ellipse",
        ...bounds,
        ...defaults.styles.ellipse,
        opacity: defaults.styles.ellipse.opacity / 100,
      };
    if (tool === "mosaic")
      return { id, type: "mosaic", ...bounds, ...defaults.styles.mosaic };
    if (tool === "pin") return { id, type: "pin", ...bounds };
    return normalizeAnnotation({
      id,
      type: "rectangle",
      ...bounds,
      ...defaults.styles.rectangle,
      opacity: defaults.styles.rectangle.opacity / 100,
    });
  }
  function beginText(
    annotation: TextAnnotation,
    mode: "create" | "edit",
    screen: Point,
  ) {
    const token =
      mode === "edit" ? editing.begin(annotation, "text") : undefined;
    updateTextDraft({
      mode,
      annotation,
      token,
      value: annotation.text,
      screenX: Math.max(0, Math.min(screen.x, window.innerWidth - 24)),
      screenY: Math.max(0, Math.min(screen.y, window.innerHeight - 24)),
    });
  }
  function startObjectGesture(
    event: ReactPointerEvent<HTMLCanvasElement>,
    point: Point,
    annotation: DrawingAnnotation,
    handle: ObjectHandle | null,
  ) {
    const token = editing.begin(
      annotation,
      handle
        ? annotation.type === "arrow"
          ? "arrow-endpoint"
          : "resize"
        : "move",
    );
    objectInteractionRef.current = {
      pointerId: event.pointerId,
      start: point,
      startViewport: { x: event.clientX, y: event.clientY },
      original: annotation,
      token,
      handle,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    dispatch({ type: "select", id: annotation.id });
  }
  function previewObjectGesture(
    event: ReactPointerEvent<HTMLCanvasElement>,
    point: Point,
  ) {
    const interaction = objectInteractionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    if (
      !interaction.moved &&
      !hasExceededTargetDragThreshold(interaction.startViewport, {
        x: event.clientX,
        y: event.clientY,
      })
    )
      return;
    interaction.moved = true;
    const delta = {
      x: point.x - interaction.start.x,
      y: point.y - interaction.start.y,
    };
    const next =
      interaction.handle === "from" || interaction.handle === "to"
        ? interaction.original.type === "arrow"
          ? moveArrowEndpoint(
              interaction.original,
              interaction.handle,
              point,
              imageSize,
            )
          : interaction.original
        : interaction.handle
          ? resizeAnnotation(
              interaction.original,
              interaction.handle,
              delta,
              imageSize,
            )
          : moveAnnotation(interaction.original, delta, imageSize);
    editing.preview(interaction.token, next);
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || isCommitting || closingRef.current) return;
    const point = pointerToImagePoint(event);
    if (!point) {
      return;
    }

    if (textDraftRef.current) {
      event.preventDefault();
      if (!compositionRef.current) commitTextDraft();
      return;
    }
    finishProperty();

    if (
      tool !== "select" &&
      activeSelection &&
      !isPointInBounds(point, activeSelection)
    ) {
      return;
    }

    setError(null);

    if (tool === "select") {
      if (!selection) {
        const target = resolveScreenshotTargetAtPoint(
          targets,
          point,
          imageSize,
        );
        event.currentTarget.setPointerCapture(event.pointerId);
        selectionInteractionRef.current = {
          kind: "pending-target",
          pointerId: event.pointerId,
          start: point,
          startViewport: { x: event.clientX, y: event.clientY },
          target,
        };
        setHoverTarget(target);
        setCrosshair(point);
        return;
      }
      const handle = selectedObject
        ? hitAnnotationHandle(selectedObject, point, imageSize, viewportSize)
        : null;
      if (selectedObject && handle) {
        startObjectGesture(event, point, selectedObject, handle);
        return;
      }
      const object = hitTestAnnotation(history.annotations, point);
      if (object && object.type !== "pin") {
        startObjectGesture(event, point, object, null);
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      dispatch({ type: "select", id: null });
      const mode = resolveSelectionPointerMode([], point, selection.bounds);
      if (mode === "annotation") return;
      selectionInteractionRef.current = {
        kind: mode,
        pointerId: event.pointerId,
        start: point,
        initial: selection,
      };
      setSelectionDraft(null);
      setSelectionCursor(
        isPointInBounds(point, selection.bounds) ? "grabbing" : "default",
      );
      setCrosshair(point);
      return;
    }

    if (tool === "text") {
      const style = defaults.styles.text;
      const scale = sourceScale;
      beginText(
        {
          id: createId("text"),
          type: "text",
          x: point.x,
          y: Math.min(imageSize.height, point.y + style.fontSize),
          text: "",
          strokeWidth: 2,
          ...style,
          opacity: style.opacity / 100,
        },
        "create",
        {
          x: event.clientX,
          y:
            event.clientY +
            (Math.min(imageSize.height, point.y + style.fontSize) -
              style.fontSize -
              point.y) *
              scale,
        },
      );
      return;
    }

    drawingPointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = point;
    draftIdRef.current = createId(tool);
    updateDraft(createDraft(point, point));
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = pointerToImagePoint(
      event,
      Boolean(
        selectionInteractionRef.current ||
        objectInteractionRef.current ||
        drawingPointerRef.current !== null,
      ),
    );
    if (!point) {
      if (!selectionInteractionRef.current) {
        setHoverTarget(null);
        setCrosshair(null);
      }
      return;
    }

    if (objectInteractionRef.current) {
      previewObjectGesture(event, point);
      return;
    }
    const interaction = selectionInteractionRef.current;
    setSelectionCursor(
      interaction?.kind === "move"
        ? "grabbing"
        : tool === "select" &&
            selection &&
            isPointInBounds(point, selection.bounds) &&
            resolveSelectPointerTarget(history.annotations, point).kind !==
              "annotation"
          ? "grab"
          : "default",
    );
    if (
      interaction?.kind === "pending-target" &&
      interaction.pointerId === event.pointerId &&
      session
    ) {
      setCrosshair(point);
      const currentTarget = resolveScreenshotTargetAtPoint(
        targets,
        point,
        imageSize,
      );
      setHoverTarget(currentTarget);
      if (
        hasExceededTargetDragThreshold(interaction.startViewport, {
          x: event.clientX,
          y: event.clientY,
        })
      ) {
        const initial = selectionGeometryFromBounds({
          x: interaction.start.x,
          y: interaction.start.y,
          width: 0,
          height: 0,
        });
        selectionInteractionRef.current = {
          kind: "create",
          pointerId: event.pointerId,
          start: interaction.start,
          initial,
        };
        setHoverTarget(null);
        const nextBounds = resolveSelectionDrag(
          initial.bounds,
          interaction.start,
          point,
          imageSize,
        );
        setSelectionDraft(
          normalizeSelectionGeometry(
            { ...initial, bounds: nextBounds },
            imageSize,
          ),
        );
      }
      return;
    }
    if (
      (interaction?.kind === "create" || interaction?.kind === "move") &&
      interaction.pointerId === event.pointerId &&
      session
    ) {
      const nextSelection =
        interaction.kind === "move"
          ? moveSelectionBy(
              interaction.initial.bounds,
              {
                x: point.x - interaction.start.x,
                y: point.y - interaction.start.y,
              },
              imageSize,
            )
          : resolveSelectionDrag(
              interaction.initial.bounds,
              interaction.start,
              point,
              { width: session.media.width, height: session.media.height },
            );
      setSelectionDraft(
        nextSelection === interaction.initial.bounds
          ? null
          : normalizeSelectionGeometry(
              { ...interaction.initial, bounds: nextSelection },
              imageSize,
            ),
      );
      setCrosshair(point);
      return;
    }

    if (!selection && tool === "select") {
      setHoverTarget(resolveScreenshotTargetAtPoint(targets, point, imageSize));
      setCrosshair(point);
    }

    const start = dragStartRef.current;
    if (!start || drawingPointerRef.current !== event.pointerId) return;
    updateDraft(createDraft(start, point));
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = pointerToImagePoint(event, true);
    const objectInteraction = objectInteractionRef.current;
    if (objectInteraction?.pointerId === event.pointerId) {
      if (point) previewObjectGesture(event, point);
      objectInteractionRef.current = null;
      editing.commit(objectInteraction.token);
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    const interaction = selectionInteractionRef.current;
    if (
      interaction?.kind === "pending-target" &&
      interaction.pointerId === event.pointerId &&
      session
    ) {
      const endTarget = point
        ? resolveScreenshotTargetAtPoint(targets, point, imageSize)
        : null;
      const bounds = resolveStableTargetClick(
        interaction.target,
        endTarget,
        false,
      );
      if (bounds) {
        setSelection(
          normalizeSelectionGeometry(
            selectionGeometryFromBounds(bounds),
            imageSize,
          ),
        );
        setHoverTarget(null);
        setCrosshair(null);
      }
      selectionInteractionRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }
    if (
      (interaction?.kind === "create" || interaction?.kind === "move") &&
      interaction.pointerId === event.pointerId &&
      session
    ) {
      const nextSelection = point
        ? interaction.kind === "move"
          ? moveSelectionBy(
              interaction.initial.bounds,
              {
                x: point.x - interaction.start.x,
                y: point.y - interaction.start.y,
              },
              imageSize,
            )
          : resolveSelectionDrag(
              interaction.initial.bounds,
              interaction.start,
              point,
              { width: session.media.width, height: session.media.height },
            )
        : interaction.initial.bounds;
      const nextGeometry = normalizeSelectionGeometry(
        { ...interaction.initial, bounds: nextSelection },
        imageSize,
      );
      if (
        nextGeometry.bounds.width >= MINIMUM_SELECTION_DIMENSION &&
        nextGeometry.bounds.height >= MINIMUM_SELECTION_DIMENSION
      ) {
        setSelection(nextGeometry);
      }
      setSelectionDraft(null);
      setSelectionCursor("grab");
      selectionInteractionRef.current = null;
      setHoverTarget(null);
      setCrosshair(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }

    if (drawingPointerRef.current !== event.pointerId) return;
    drawingPointerRef.current = null;
    const start = dragStartRef.current;
    const currentDraft =
      start && point ? createDraft(start, point) : draftRef.current;
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
      void commitPin(selectionGeometryFromBounds(currentDraft));
      return;
    }

    dispatch({ type: "add", annotation: currentDraft });
  };

  const rollbackSelectionPointerInteraction = (event: ReactPointerEvent) => {
    if (
      objectInteractionRef.current?.pointerId === event.pointerId ||
      drawingPointerRef.current === event.pointerId
    ) {
      rollbackGesture();
      return;
    }
    const interaction = selectionInteractionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) {
      return;
    }

    selectionInteractionRef.current = null;
    setSelectionDraft(null);
    setSelectionCursor("default");
    setCrosshair(null);
    setHoverTarget(null);
  };

  const handleResizePointerDown = (
    event: ReactPointerEvent<HTMLSpanElement>,
    handle: SelectionResizeHandle,
  ) => {
    if (textDraftRef.current) {
      if (!compositionRef.current) commitTextDraft();
      return;
    }
    if (tool !== "select" || !session || !selection || isCommitting) {
      return;
    }

    const point = pointerToImagePoint(event, true);
    if (!point) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dispatch({ type: "select", id: null });
    selectionInteractionRef.current = {
      kind: "resize",
      pointerId: event.pointerId,
      start: point,
      initial: selection,
      handle,
    };
    setSelectionDraft(null);
  };

  const handleResizePointerMove = (
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => {
    const interaction = selectionInteractionRef.current;
    if (
      interaction?.kind !== "resize" ||
      interaction.pointerId !== event.pointerId ||
      !session
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const point = pointerToImagePoint(event, true);
    if (!point) {
      return;
    }

    const bounds = resolveSelectionResize(
      interaction.initial.bounds,
      interaction.handle,
      {
        x: point.x - interaction.start.x,
        y: point.y - interaction.start.y,
      },
      imageSize,
    );
    setSelectionDraft(
      normalizeSelectionGeometry({ ...interaction.initial, bounds }, imageSize),
    );
  };

  const handleResizePointerUp = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const interaction = selectionInteractionRef.current;
    if (
      interaction?.kind !== "resize" ||
      interaction.pointerId !== event.pointerId ||
      !session
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const point = pointerToImagePoint(event, true);
    const nextSelection = point
      ? resolveSelectionResize(
          interaction.initial.bounds,
          interaction.handle,
          {
            x: point.x - interaction.start.x,
            y: point.y - interaction.start.y,
          },
          imageSize,
        )
      : interaction.initial.bounds;
    setSelection(
      normalizeSelectionGeometry(
        { ...interaction.initial, bounds: nextSelection },
        imageSize,
      ),
    );
    setSelectionDraft(null);
    selectionInteractionRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleResizePointerCancel = (
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    rollbackSelectionPointerInteraction(event);
  };

  function commitTextDraft() {
    if (compositionRef.current || closingRef.current) return;
    finishProperty();
    const currentDraft = textDraftRef.current;
    if (!currentDraft) return;
    updateTextDraft(null);
    if (currentDraft.mode === "edit") {
      if (!currentDraft.value.trim()) {
        editing.cancel();
        dispatch({ type: "removeSelected" });
      } else if (currentDraft.token !== undefined) {
        editing.preview(currentDraft.token, {
          ...currentDraft.annotation,
          text: currentDraft.value,
        });
        editing.commit(currentDraft.token);
      }
    } else if (currentDraft.value.trim())
      dispatch({
        type: "add",
        annotation: { ...currentDraft.annotation, text: currentDraft.value },
      });
  }
  function handleDoubleClick(event: React.MouseEvent<HTMLCanvasElement>) {
    if (tool !== "select" || textDraftRef.current || pointerBusy) return;
    const rect = imageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const point = viewportPointToImagePoint(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      imageSize,
      { width: rect.width, height: rect.height },
      true,
    );
    const object = point ? hitTestAnnotation(history.annotations, point) : null;
    if (object?.type === "text") {
      dispatch({ type: "select", id: object.id });
      const position = annotationBoundsToViewport(
        { x: object.x, y: object.y - object.fontSize, width: 0, height: 0 },
        imageSize,
        viewportSize,
      );
      beginText(object, "edit", position);
    }
  }
  const objectBounds = selectedObject ? annotationBounds(selectedObject) : null;
  const objectViewportBounds = objectBounds
    ? annotationBoundsToViewport(objectBounds, imageSize, viewportSize)
    : null;

  const textViewportPosition = textDraft
    ? annotationBoundsToViewport(
        {
          x: textDraft.annotation.x,
          y: textDraft.annotation.y - textDraft.annotation.fontSize,
          width: 0,
          height: 0,
        },
        imageSize,
        viewportSize,
      )
    : null;

  const selectionViewportRadius =
    activeGeometry &&
    activeSelection &&
    selectionViewportBounds &&
    activeSelection.width > 0
      ? activeGeometry.cornerRadius *
        (selectionViewportBounds.width / activeSelection.width)
      : 0;
  const selectionMaskPath =
    selectionViewportBounds && imageViewportBounds
      ? [
          `M ${imageViewportBounds.x} ${imageViewportBounds.y}`,
          `H ${imageViewportBounds.x + imageViewportBounds.width}`,
          `V ${imageViewportBounds.y + imageViewportBounds.height}`,
          `H ${imageViewportBounds.x}`,
          "Z",
          roundedRectanglePath(
            selectionViewportBounds,
            selectionViewportRadius,
          ),
        ].join(" ")
      : null;

  return (
    <main
      className="capture-shell"
      onPointerDownCapture={(event) => {
        const target = event.target;
        if (
          target instanceof Element &&
          target.closest("[data-capture-cancel]")
        ) {
          event.preventDefault();
          event.stopPropagation();
          closeSession();
          return;
        }
        if (
          textDraftRef.current &&
          target instanceof Element &&
          !target.closest("[data-annotation-edit-domain]") &&
          !target.closest(".capture-overlay") &&
          !target.closest(".capture-selection-handle")
        ) {
          event.preventDefault();
          event.stopPropagation();
          if (!compositionRef.current) commitTextDraft();
        }
      }}
    >
      {imageSrc ? (
        <img
          ref={imageRef}
          className="capture-image"
          src={imageSrc}
          alt=""
          draggable={false}
        />
      ) : null}
      <canvas
        ref={overlayRef}
        className="capture-overlay"
        style={{ cursor: tool === "select" ? selectionCursor : undefined }}
        onDoubleClick={handleDoubleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={rollbackSelectionPointerInteraction}
        onLostPointerCapture={rollbackSelectionPointerInteraction}
        onPointerLeave={() => {
          if (!selectionInteractionRef.current) {
            setHoverTarget(null);
            setCrosshair(null);
          }
        }}
      />
      {!selection && hoverViewportBounds ? (
        <div
          className="capture-target-preview"
          role="img"
          aria-label={t("screenshot.target.preview")}
          style={{
            left: hoverViewportBounds.x,
            top: hoverViewportBounds.y,
            width: hoverViewportBounds.width,
            height: hoverViewportBounds.height,
          }}
        />
      ) : null}
      {crosshair && imageViewportBounds ? (
        <div
          className="capture-crosshair"
          role="img"
          aria-label={t("screenshot.target.guides")}
          style={
            {
              "--capture-guide-x": `${imageViewportBounds.x + (crosshair.x / imageSize.width) * imageViewportBounds.width}px`,
              "--capture-guide-y": `${imageViewportBounds.y + (crosshair.y / imageSize.height) * imageViewportBounds.height}px`,
              "--capture-image-left": `${imageViewportBounds.x}px`,
              "--capture-image-top": `${imageViewportBounds.y}px`,
              "--capture-image-width": `${imageViewportBounds.width}px`,
              "--capture-image-height": `${imageViewportBounds.height}px`,
            } as CSSProperties
          }
        >
          <span className="capture-guide-horizontal" />
          <span className="capture-guide-vertical" />
        </div>
      ) : null}
      {!selection && imageSrc ? (
        <p className="capture-targeting-hint" role="status">
          {t("screenshot.target.hint")}
        </p>
      ) : null}
      {selectionMaskPath && selectionViewportBounds ? (
        <svg className="capture-selection-chrome" aria-hidden="true">
          <path
            className="capture-selection-dimming"
            d={selectionMaskPath}
            fillRule="evenodd"
          />
          <path
            className={
              selectionDraft
                ? "capture-selection-border dragging"
                : "capture-selection-border"
            }
            d={roundedRectanglePath(
              selectionViewportBounds,
              selectionViewportRadius,
            )}
          />
        </svg>
      ) : null}
      {selectedObject && objectViewportBounds && !textDraft ? (
        <div
          className="capture-object-frame"
          role="img"
          aria-label={t("screenshot.properties.object")}
          style={{
            left: objectViewportBounds.x,
            top: objectViewportBounds.y,
            width: objectViewportBounds.width,
            height: objectViewportBounds.height,
          }}
        >
          {annotationHandles(selectedObject).map(({ handle, point }) => (
            <span
              key={handle}
              className="capture-object-handle"
              data-object-handle={handle}
              style={{
                left: (point.x - objectBounds!.x) * sourceScale,
                top: (point.y - objectBounds!.y) * sourceScale,
              }}
            />
          ))}
        </div>
      ) : null}
      {activeSelection && selectionViewportBounds ? (
        <div
          className={`capture-selection-frame${selectionDraft ? " dragging" : ""}${tool === "select" ? " adjustable" : ""}`}
          style={{
            left: selectionViewportBounds.x,
            top: selectionViewportBounds.y,
            width: selectionViewportBounds.width,
            height: selectionViewportBounds.height,
            borderRadius: selectionViewportRadius,
          }}
          aria-hidden="true"
        >
          {CAPTURE_SELECTION_HANDLES.map(({ handle, cursor }) => (
            <span
              className={`capture-selection-handle ${handle}`}
              data-handle={handle}
              key={handle}
              style={{ cursor }}
              onPointerDown={(event) => handleResizePointerDown(event, handle)}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              onPointerCancel={handleResizePointerCancel}
              onLostPointerCapture={handleResizePointerCancel}
            />
          ))}
        </div>
      ) : null}
      {selection && activeGeometry && selectionViewportBounds ? (
        <SelectionGeometryControls
          geometry={activeGeometry}
          imageSize={imageSize}
          viewportBounds={selectionViewportBounds}
          viewportSize={viewportSize}
          onBoundsChange={setGeometryControlBounds}
          disabled={editBusy || isCommitting}
          labels={{
            group: t("screenshot.geometry.group"),
            width: t("screenshot.geometry.width"),
            height: t("screenshot.geometry.height"),
            radius: t("screenshot.geometry.radius"),
            invalid: t("screenshot.geometry.invalid"),
          }}
          onChange={(geometry) =>
            setSelection(normalizeSelectionGeometry(geometry, imageSize))
          }
        />
      ) : null}
      {textDraft ? (
        <div data-annotation-edit-domain="true">
          <textarea
            ref={textInputRef}
            className="capture-text-input"
            style={{
              left: textViewportPosition!.x,
              top: textViewportPosition!.y,
              font: textFont({
                ...textDraft.annotation,
                fontSize: textDraft.annotation.fontSize * sourceScale,
              }),
              lineHeight: 1.35,
              color: textDraft.annotation.color,
              opacity: textDraft.annotation.opacity,
              width: Math.min(
                viewportSize.width - textViewportPosition!.x,
                Math.max(
                  TEXT_INPUT_WIDTH,
                  textLayout({ ...textDraft.annotation, text: textDraft.value })
                    .bounds.width *
                    sourceScale +
                    18,
                ),
              ),
              height: Math.min(
                viewportSize.height - textViewportPosition!.y,
                Math.max(
                  TEXT_INPUT_HEIGHT,
                  textLayout({ ...textDraft.annotation, text: textDraft.value })
                    .bounds.height *
                    sourceScale +
                    18,
                ),
              ),
            }}
            value={textDraft.value}
            aria-label={t("screenshot.toolbar.text")}
            aria-describedby="capture-text-hint"
            onChange={(event) =>
              updateTextDraft({ ...textDraft, value: event.target.value })
            }
            onCompositionStart={() => {
              compositionRef.current = true;
            }}
            onCompositionEnd={() => {
              compositionRef.current = false;
            }}
            onBlur={(event) => {
              if (
                event.relatedTarget instanceof Element &&
                !event.relatedTarget.closest("[data-annotation-edit-domain]")
              )
                commitTextDraft();
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (
                event.nativeEvent.isComposing ||
                compositionRef.current ||
                event.keyCode === 229
              )
                return;
              if (event.key === "Escape") {
                event.preventDefault();
                if (propertyInteractionRef.current) {
                  cancelProperty();
                  return;
                }
                updateTextDraft(null);
                editing.cancel();
              } else if (
                event.key === "Enter" &&
                (event.metaKey || event.ctrlKey)
              ) {
                event.preventDefault();
                commitTextDraft();
              }
            }}
          />
          <span id="capture-text-hint" className="capture-text-hint">
            {t("screenshot.properties.textHint")}
          </span>
        </div>
      ) : null}
      {renderFailed ? (
        <p className="capture-error" role="alert">
          {t("screenshot.properties.renderFailed")}
        </p>
      ) : null}
      {defaults.saveFailed ? (
        <div className="capture-storage-notice" role="status">
          {t("screenshot.properties.saveFailed")}
          <button
            type="button"
            onClick={defaults.dismissFailure}
            aria-label={t("screenshot.properties.dismiss")}
          >
            ×
          </button>
        </div>
      ) : null}
      {error ? <p className="capture-error">{error}</p> : null}
      {selection ? (
        <div
          ref={toolbarRef}
          className="capture-toolbar-stack"
          data-ready={toolbarPosition ? "true" : "false"}
          data-placement={
            toolbarDrag.mode === "manual"
              ? "manual"
              : toolbarPosition?.placement
          }
          data-mode={toolbarDrag.mode}
          style={{
            left: toolbarPosition?.left ?? 0,
            top: toolbarPosition?.top ?? 0,
          }}
        >
          <CaptureToolbarPositionControls
            moveLabel={t("screenshot.properties.move")}
            disabled={isCommitting || (pointerBusy && !toolbarDrag.dragging)}
            handleProps={toolbarDrag.handleProps}
            onRestore={toolbarDrag.restore}
          />
          <nav
            className="capture-toolbar-live"
            aria-label={t("screenshot.toolbar.label")}
            onFocusCapture={(event) => {
              if (event.target instanceof HTMLButtonElement)
                event.target.scrollIntoView({
                  block: "nearest",
                  inline: "nearest",
                });
            }}
          >
            <span
              className="capture-tool-group"
              role="group"
              aria-label={t("screenshot.toolbar.tools")}
            >
              {tools.map(({ tool: entryTool, labelKey, Icon }) => {
                const label = t(labelKey);
                const selected = entryTool === tool;
                return (
                  <button
                    type="button"
                    className={
                      selected
                        ? "capture-tool-live selected"
                        : "capture-tool-live"
                    }
                    key={entryTool}
                    data-capture-tool={entryTool}
                    title={label}
                    aria-label={label}
                    aria-pressed={selected}
                    disabled={pointerBusy || isCommitting}
                    onClick={() => changeTool(entryTool)}
                  >
                    <Icon aria-hidden="true" />
                  </button>
                );
              })}
            </span>
            <span className="capture-divider-live" aria-hidden="true" />
            <span
              className="capture-tool-group"
              role="group"
              aria-label={t("screenshot.toolbar.history")}
            >
              <button
                type="button"
                className="capture-tool-live"
                title={t("screenshot.toolbar.undo")}
                aria-label={t("screenshot.toolbar.undo")}
                disabled={
                  history.undoStack.length === 0 || editBusy || isCommitting
                }
                onClick={() => dispatch({ type: "undo" })}
              >
                <Undo2 aria-hidden="true" />
              </button>
              <button
                type="button"
                className="capture-tool-live"
                title={t("screenshot.toolbar.redo")}
                aria-label={t("screenshot.toolbar.redo")}
                disabled={
                  history.redoStack.length === 0 || editBusy || isCommitting
                }
                onClick={() => dispatch({ type: "redo" })}
              >
                <Redo2 aria-hidden="true" />
              </button>
              <button
                type="button"
                className="capture-tool-live danger"
                title={t("screenshot.toolbar.delete")}
                aria-label={t("screenshot.toolbar.delete")}
                disabled={!history.selectedId || editBusy || isCommitting}
                onClick={() => dispatch({ type: "removeSelected" })}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </span>
            <span className="capture-divider-live" aria-hidden="true" />
            <span
              className="capture-tool-group"
              role="group"
              aria-label={t("screenshot.toolbar.finish")}
            >
              <button
                type="button"
                className="capture-tool-live"
                title={t("ocr.originalHint")}
                aria-label={t("ocr.capture")}
                disabled={
                  isCommitting ||
                  editBusy ||
                  renderFailed ||
                  !selection ||
                  !ocrAvailable
                }
                onClick={() => void recognizeSelection()}
              >
                OCR
              </button>
              <button
                type="button"
                className="capture-tool-live danger"
                title={t("screenshot.toolbar.cancel")}
                aria-label={t("screenshot.toolbar.cancel")}
                data-capture-cancel="true"
                onClick={closeSession}
              >
                <X aria-hidden="true" />
              </button>
              <button
                type="button"
                className="capture-tool-live"
                title={t("screenshot.toolbar.save")}
                aria-label={t("screenshot.toolbar.save")}
                disabled={
                  isCommitting || editBusy || renderFailed || !selection
                }
                onClick={() => commit("save")}
              >
                <Download aria-hidden="true" />
              </button>
              <button
                type="button"
                className="capture-tool-live confirm"
                title={
                  session?.initialAction === "ocr"
                    ? t("ocr.originalHint")
                    : t("screenshot.toolbar.copy")
                }
                aria-label={
                  session?.initialAction === "ocr"
                    ? t("ocr.capture")
                    : t("screenshot.toolbar.copy")
                }
                disabled={
                  isCommitting ||
                  editBusy ||
                  renderFailed ||
                  !selection ||
                  (session?.initialAction === "ocr" && !ocrAvailable)
                }
                onClick={() =>
                  session?.initialAction === "ocr"
                    ? void recognizeSelection()
                    : void commit("copy")
                }
              >
                <Check aria-hidden="true" />
              </button>
            </span>
          </nav>
        </div>
      ) : null}
      {selection && panelContext ? (
        <div
          ref={propertyPanelRef}
          className="capture-property-shell"
          data-side={toolbarDrag.side}
          data-ready={
            toolbarPosition && propertyAnchor.ready ? "true" : "false"
          }
          data-annotation-edit-domain="true"
          style={{
            left: propertyAnchor.left,
            top: propertyAnchor.top,
            maxHeight: propertyAnchor.maxHeight,
          }}
        >
          {propertyAnchor.visible ? (
            <span
              className="capture-property-caret"
              aria-hidden="true"
              style={{ left: propertyAnchor.caretLeft }}
            />
          ) : null}
          <div className="capture-property-content">
            <AnnotationPropertiesPanel
              key={propertyPanelKey}
              context={panelContext}
              t={t}
              disabled={pointerBusy || isCommitting}
              onBegin={beginProperty}
              onPatch={previewProperty}
              onCommit={finishProperty}
              onCancel={cancelProperty}
              onReset={() => {
                cancelProperty();
                defaults.reset(panelContext.tool);
                setPropertyRevision((revision) => revision + 1);
              }}
            />
          </div>
        </div>
      ) : null}
      <CapturePropertyMeasurements t={t} onMeasure={measureProperties} />
    </main>
  );
}

export default CaptureApp;
