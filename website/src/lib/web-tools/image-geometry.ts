import type { WatermarkSettings } from './image-contracts.ts';
export function resizedImageDimensions(width: number, height: number, maxLongEdge: number | null): { width: number; height: number } {
  const ratio = maxLongEdge === null ? 1 : Math.min(1, maxLongEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}
export interface WatermarkDraw { x: number; y: number; rotation: number }
export function watermarkGeometry(width: number, height: number, settings: WatermarkSettings, textWidth: number, textHeight: number): WatermarkDraw[] {
  const short = Math.min(width, height), angle = settings.rotation * Math.PI / 180;
  const rotatedWidth = Math.abs(textWidth * Math.cos(angle)) + Math.abs(textHeight * Math.sin(angle));
  const rotatedHeight = Math.abs(textWidth * Math.sin(angle)) + Math.abs(textHeight * Math.cos(angle));
  if (settings.mode === 'single') {
    const margin = short * settings.marginRatio;
    const horizontal = settings.position.endsWith('left') ? 0 : settings.position.endsWith('right') ? 1 : .5;
    const vertical = settings.position.startsWith('top') ? 0 : settings.position.startsWith('bottom') ? 1 : .5;
    const bounded = (length: number, span: number, ratio: number) => span + margin * 2 >= length ? length / 2 : margin + span / 2 + (length - margin * 2 - span) * ratio;
    return [{ x: bounded(width, rotatedWidth, horizontal), y: bounded(height, rotatedHeight, vertical), rotation: angle }];
  }
  const dx = Math.max(1, rotatedWidth + short * settings.spacingRatio), dy = Math.max(1, rotatedHeight + short * settings.spacingRatio);
  let columns = Math.max(1, Math.ceil(width / dx)), rows = Math.max(1, Math.ceil(height / dy));
  // Reduce the denser axis without moving the sole column/row outside a narrow image.
  while (columns * rows > 500) {
    if (columns >= rows) columns = Math.max(1, Math.floor(500 / rows));
    else rows = Math.max(1, Math.floor(500 / columns));
  }
  const draws: WatermarkDraw[] = [];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) draws.push({ x: (column + .5) * width / columns, y: (row + .5) * height / rows, rotation: angle });
  return draws;
}
