import type { AnnotationObject, HistoryState } from "./captureTypes";

export type CaptureAction =
  | { type: "add"; annotation: AnnotationObject }
  | { type: "replace"; annotation: AnnotationObject }
  | { type: "select"; id: string | null }
  | { type: "removeSelected" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "clear" };

export const initialHistoryState: HistoryState = {
  annotations: [],
  selectedId: null,
  undoStack: [],
  redoStack: [],
};

function cloneAnnotations(annotations: AnnotationObject[]): AnnotationObject[] {
  return structuredClone(annotations);
}

function pushUndo(state: HistoryState): HistoryState {
  return {
    ...state,
    undoStack: [...state.undoStack, cloneAnnotations(state.annotations)],
    redoStack: [],
  };
}

export function captureReducer(state: HistoryState, action: CaptureAction): HistoryState {
  switch (action.type) {
    case "add": {
      const next = pushUndo(state);
      return {
        ...next,
        annotations: [...next.annotations, action.annotation],
        selectedId: action.annotation.id,
      };
    }

    case "replace": {
      const index = state.annotations.findIndex((annotation) => annotation.id === action.annotation.id);
      if (index < 0) {
        return state;
      }
      const next = pushUndo(state);
      const annotations = [...next.annotations];
      annotations[index] = action.annotation;
      return {
        ...next,
        annotations,
      };
    }

    case "select":
      return {
        ...state,
        selectedId: action.id,
      };

    case "removeSelected": {
      if (!state.selectedId) {
        return state;
      }
      const next = pushUndo(state);
      return {
        ...next,
        annotations: next.annotations.filter((annotation) => annotation.id !== state.selectedId),
        selectedId: null,
      };
    }

    case "undo": {
      const previous = state.undoStack[state.undoStack.length - 1];
      if (!previous) {
        return state;
      }
      return {
        ...state,
        annotations: cloneAnnotations(previous),
        selectedId: null,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, cloneAnnotations(state.annotations)],
      };
    }

    case "redo": {
      const next = state.redoStack[state.redoStack.length - 1];
      if (!next) {
        return state;
      }
      return {
        ...state,
        annotations: cloneAnnotations(next),
        selectedId: null,
        undoStack: [...state.undoStack, cloneAnnotations(state.annotations)],
        redoStack: state.redoStack.slice(0, -1),
      };
    }

    case "clear": {
      if (state.annotations.length === 0) {
        return state;
      }
      const next = pushUndo(state);
      return {
        ...next,
        annotations: [],
        selectedId: null,
      };
    }

    default:
      return state;
  }
}

export function createId(prefix = "ann"): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${random}`;
}
