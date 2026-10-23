/** Only finite numeric pixels may enter native/imported layer origin styles. */
export function layerTransformOrigin(origin?: { x: number, y: number }): string | undefined {
  if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return undefined
  return `${origin.x}px ${origin.y}px`
}
