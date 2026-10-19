import type { AnnotationObject, DrawingAnnotation } from "./captureTypes";
import type { CaptureAction } from "./captureReducer";
export type AnnotationEditKind =
  | "property"
  | "move"
  | "resize"
  | "arrow-endpoint"
  | "text";
interface Transaction {
  token: number;
  kind: AnnotationEditKind;
  original: DrawingAnnotation;
  preview: DrawingAnnotation;
}
export class AnnotationEditController {
  private revision = 0;
  private transaction: Transaction | null = null;
  private closed = false;
  get active(): boolean {
    return this.transaction !== null;
  }
  get current(): Readonly<Transaction> | null {
    return this.transaction;
  }
  begin(annotation: DrawingAnnotation, kind: AnnotationEditKind): number {
    const token = ++this.revision;
    if (!this.closed)
      this.transaction = {
        token,
        kind,
        original: structuredClone(annotation),
        preview: structuredClone(annotation),
      };
    return token;
  }
  preview(token: number, annotation: DrawingAnnotation): void {
    const tx = this.transaction;
    if (
      !this.closed &&
      tx?.token === token &&
      annotation.id === tx.original.id &&
      annotation.type === tx.original.type
    )
      tx.preview = annotation;
  }
  scene(annotations: AnnotationObject[]): AnnotationObject[] {
    const tx = this.transaction;
    return tx
      ? annotations.map((a) => (a.id === tx.original.id ? tx.preview : a))
      : annotations;
  }
  commit(token: number, annotations: AnnotationObject[]): CaptureAction | null {
    const tx = this.transaction;
    if (!tx || tx.token !== token || this.closed) return null;
    this.transaction = null;
    const target = annotations.find((a) => a.id === tx.original.id);
    if (
      JSON.stringify(target) !== JSON.stringify(tx.original) ||
      JSON.stringify(tx.preview) === JSON.stringify(tx.original)
    )
      return null;
    return { type: "replace", annotation: tx.preview };
  }
  cancel(): void {
    this.transaction = null;
    ++this.revision;
  }
  close(): void {
    this.cancel();
    this.closed = true;
  }
}
