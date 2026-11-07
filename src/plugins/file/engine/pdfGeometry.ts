import { PdfReconstructionError } from "./pdfComplexity.js";
export interface PdfBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}
export type PdfMatrix = readonly number[];
function validMatrix(matrix: PdfMatrix) {
    if (matrix.length !== 6 || !matrix.every(Number.isFinite))
        throw new PdfReconstructionError("unsupportedInput");
}
export function transformPoint(matrix: PdfMatrix, x: number, y: number): [
    number,
    number
] {
    validMatrix(matrix);
    if (![x, y].every(Number.isFinite))
        throw new PdfReconstructionError("unsupportedInput");
    return [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
}
export function multiplyTransform(left: PdfMatrix, right: PdfMatrix): number[] {
    validMatrix(left);
    validMatrix(right);
    return [left[0] * right[0] + left[2] * right[1], left[1] * right[0] + left[3] * right[1],
        left[0] * right[2] + left[2] * right[3], left[1] * right[2] + left[3] * right[3],
        left[0] * right[4] + left[2] * right[5] + left[4], left[1] * right[4] + left[3] * right[5] + left[5]];
}
export function inverseTransform(matrix: PdfMatrix): number[] {
    validMatrix(matrix);
    const [a, b, c, d, e, f] = matrix;
    const determinant = a * d - b * c;
    if (Math.abs(determinant) < 1e-12)
        throw new PdfReconstructionError("unsupportedInput");
    return [d / determinant, -b / determinant, -c / determinant, a / determinant, (c * f - d * e) / determinant, (b * e - a * f) / determinant];
}
export function transformBounds(matrix: PdfMatrix, bounds: PdfBounds): PdfBounds {
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width < 0 || bounds.height < 0)
        throw new PdfReconstructionError("unsupportedInput");
    const points = [[bounds.x, bounds.y], [bounds.x + bounds.width, bounds.y], [bounds.x, bounds.y + bounds.height], [bounds.x + bounds.width, bounds.y + bounds.height]]
        .map(([x, y]) => transformPoint(matrix, x, y));
    const x = Math.min(...points.map(p => p[0]));
    const y = Math.min(...points.map(p => p[1]));
    return { x, y, width: Math.max(...points.map(p => p[0])) - x, height: Math.max(...points.map(p => p[1])) - y };
}
export function intersects(a: PdfBounds, b: PdfBounds, tolerance = 0): boolean {
    return a.x < b.x + b.width - tolerance && b.x < a.x + a.width - tolerance && a.y < b.y + b.height - tolerance && b.y < a.y + a.height - tolerance;
}
export function contains(outer: PdfBounds, inner: PdfBounds, tolerance = 2): boolean {
    return inner.x >= outer.x - tolerance && inner.y >= outer.y - tolerance && inner.x + inner.width <= outer.x + outer.width + tolerance && inner.y + inner.height <= outer.y + outer.height + tolerance;
}
