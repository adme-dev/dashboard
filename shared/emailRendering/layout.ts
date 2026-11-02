/** Email layouts share one declared-width contract in canvas, thumbnails and
 * compiled output. Invalid legacy values use the established 600px default. */
export function resolveEmailContentWidth(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string') return 600
  const width = Number(value)
  return Number.isInteger(width) && width >= 320 && width <= 960 ? width : 600
}
