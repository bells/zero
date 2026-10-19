import { useCallback, useEffect, useRef, useState, type Dispatch } from "react";
import {
  AnnotationEditController,
  type AnnotationEditKind,
} from "./captureAnnotationEditing";
import type { CaptureAction } from "./captureReducer";
import type { AnnotationObject, DrawingAnnotation } from "./captureTypes";

export function useCaptureAnnotationEditing(
  annotations: AnnotationObject[],
  dispatch: Dispatch<CaptureAction>,
) {
  const owner = useRef(new AnnotationEditController());
  const [, refresh] = useState(0);
  const sceneRef = useRef(annotations);
  sceneRef.current = annotations;
  const notify = useCallback(() => refresh((n) => n + 1), []);
  const begin = useCallback(
    (annotation: DrawingAnnotation, kind: AnnotationEditKind) => {
      const token = owner.current.begin(annotation, kind);
      notify();
      return token;
    },
    [notify],
  );
  const preview = useCallback(
    (token: number, annotation: DrawingAnnotation) => {
      owner.current.preview(token, annotation);
      notify();
    },
    [notify],
  );
  const commit = useCallback(
    (token: number) => {
      const action = owner.current.commit(token, sceneRef.current);
      if (action) dispatch(action);
      notify();
    },
    [dispatch, notify],
  );
  const cancel = useCallback(() => {
    owner.current.cancel();
    notify();
  }, [notify]);
  useEffect(() => {
    const controller = new AnnotationEditController();
    owner.current = controller;
    return () => controller.close();
  }, []);
  return {
    begin,
    preview,
    commit,
    cancel,
    peek: () => owner.current.current,
    active: owner.current.active,
    current: owner.current.current,
    scene: owner.current.scene(annotations),
  };
}
