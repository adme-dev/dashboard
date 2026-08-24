/**
 * Data-URI SVG placeholder for ad-preview creative slots.
 *
 * The old inline placeholders pre-encoded `#` as `%23` and then ran the whole
 * string through encodeURIComponent, double-encoding the `%` — browsers decoded
 * the fill back to the literal text "%23333", an invalid colour, so the
 * placeholder rendered as a solid black rectangle. Build from raw `#` colours
 * and encode exactly once here.
 */
export interface PlaceholderOptions {
  width: number
  height: number
  bg: string
  fg: string
  label: string
}

export function svgPlaceholder({ width, height, bg, fg, label }: PlaceholderOptions): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${bg}"/><text x="50%" y="50%" text-anchor="middle" fill="${fg}" font-size="20" font-family="sans-serif" dy=".3em">${label}</text></svg>`
  return 'data:image/svg+xml,' + encodeURIComponent(svg)
}
