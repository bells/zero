import type {
  AnnotationObject,
  DrawingAnnotation,
  Point,
} from "./captureTypes";
import type { SelectionResizeHandle } from "./captureSelectionModel";
import {
  hitAnnotationHandle,
  hitTestAnnotation,
  type AnnotationHitContext,
  type ObjectHandle,
} from "./captureAnnotationGeometry.js";

export interface AnnotationPointerInput {
  annotations: readonly AnnotationObject[];
  selected: DrawingAnnotation | null;
  point: Point;
  context: AnnotationHitContext;
  cropHandle: SelectionResizeHandle | null;
  bypassObjectBody: boolean;
}
export type AnnotationPointerTarget =
  | {
      kind: "object-handle";
      annotation: DrawingAnnotation;
      handle: ObjectHandle;
    }
  | { kind: "crop-handle"; handle: SelectionResizeHandle }
  | { kind: "object"; annotation: DrawingAnnotation }
  | { kind: "blank" };

export function resolveAnnotationPointerTarget(
  input: AnnotationPointerInput,
): AnnotationPointerTarget {
  const { selected, point, context, cropHandle, bypassObjectBody } = input;
  const handle = selected
    ? hitAnnotationHandle(selected, point, context.image, context.viewport)
    : null;
  if (selected && handle)
    return { kind: "object-handle", annotation: selected, handle };
  if (cropHandle) return { kind: "crop-handle", handle: cropHandle };
  const annotation = bypassObjectBody
    ? null
    : hitTestAnnotation(input.annotations, point, context);
  return annotation ? { kind: "object", annotation } : { kind: "blank" };
}
