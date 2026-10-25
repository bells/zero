export type CaptureTool =
  | "select"
  | "rectangle"
  | "ellipse"
  | "arrow"
  | "pen"
  | "text"
  | "mosaic"
  | "pin";

export interface Point {
  x: number;
  y: number;
}

export type DrawingTool = Exclude<CaptureTool, "select" | "pin">;

interface IdentifiedAnnotation { id: string }

interface BaseAnnotation extends IdentifiedAnnotation {
  opacity: number;
  color: string;
  strokeWidth: number;
}

export interface RectangleAnnotation extends BaseAnnotation {
  type: "rectangle";
  fillMode: "outline" | "solid";
  cornerRadius: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EllipseAnnotation extends BaseAnnotation {
  type: "ellipse";
  fillMode: "outline" | "solid";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ArrowAnnotation extends BaseAnnotation {
  type: "arrow";
  heads: "single" | "double";
  from: Point;
  to: Point;
}

export interface PenAnnotation extends BaseAnnotation {
  type: "pen";
  points: Point[];
}

export interface TextAnnotation extends BaseAnnotation {
  type: "text";
  bold: boolean;
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

export interface MosaicAnnotation extends IdentifiedAnnotation {
  type: "mosaic";
  x: number;
  y: number;
  width: number;
  height: number;
  pixelSize: number;
}

export interface PinAnnotation extends IdentifiedAnnotation {
  type: "pin";
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DrawingAnnotation =
  | RectangleAnnotation
  | EllipseAnnotation
  | ArrowAnnotation
  | PenAnnotation
  | TextAnnotation
  | MosaicAnnotation;

export type AnnotationObject = DrawingAnnotation | PinAnnotation;

export interface ScreenshotMediaDescriptor {
  token: string;
  mimeType: "image/png";
  byteLength: number;
  width: number;
  height: number;
  expiresAtMs: number | null;
}

export interface ScreenshotSourceBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenshotTargetCandidate {
  id: string;
  kind: "window";
  bounds: ScreenshotSourceBounds;
}

export interface CaptureDisplaySnapshot {
  nativeId: number;
  logicalFrame: { x: number; y: number; width: number; height: number };
  physicalFrame: { x: number; y: number; width: number; height: number };
  pixelWidth: number;
  pixelHeight: number;
  sourceScaleX: number;
  sourceScaleY: number;
}
export interface CaptureSession {
  editorMode: "full" | "ocr-selection";
  display: CaptureDisplaySnapshot;
  sessionId: string;
  initialAction: "copy" | "save" | "ocr";
  media: ScreenshotMediaDescriptor;
  targets: ScreenshotTargetCandidate[];
}

export interface ScreenshotUploadLease {
  token: string;
  sessionId: string;
  action: "copy" | "save" | "pin";
  maxBytes: number;
  expiresAtMs: number;
}

export interface ScreenshotCommitResult {
  copied: boolean;
  savedPath: string | null;
  pinWindowLabel: string | null;
}

export interface ScreenshotError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface HistoryState {
  annotations: AnnotationObject[];
  selectedId: string | null;
  undoStack: AnnotationObject[][];
  redoStack: AnnotationObject[][];
}
