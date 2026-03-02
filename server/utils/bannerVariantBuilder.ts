/**
 * Banner Variant Builder — utilities for DCO variant generation.
 * Applies feed row data to layers and scales layers between formats.
 */

interface FeedBinding {
  feedId: string
  column: string
  property: string
}

interface LayerLike {
  id: number
  type: string
  x: number
  y: number
  w: number
  h: number
  feedBindings?: FeedBinding[]
  text?: string
  src?: string
  color?: string
  bgColor?: string
  fillColor?: string
  fontSize?: number
  [key: string]: any
}

/**
 * Apply feed row values to layers based on their feedBindings.
 * Returns new layer objects — does not mutate originals.
 */
export function applyFeedRowToLayers<T extends LayerLike>(
  layers: T[],
  row: Record<string, string>,
  feedId: string,
): T[] {
  return layers.map((l) => {
    if (!l.feedBindings?.length) return l
    const clone = { ...l }
    for (const binding of l.feedBindings) {
      if (binding.feedId !== feedId) continue
      const val = row[binding.column]
      if (val === undefined) continue
      switch (binding.property) {
        case 'text':
          clone.text = val
          break
        case 'src':
          clone.src = val
          break
        case 'color':
          clone.color = val
          break
        case 'bgColor':
          clone.bgColor = val
          break
        case 'fillColor':
          clone.fillColor = val
          break
        case 'fontSize':
          clone.fontSize = parseInt(val) || clone.fontSize
          break
      }
    }
    return clone
  })
}

/**
 * Scale layers from one format size to another.
 * Returns new layer objects — does not mutate originals.
 */
export function scaleLayersToFormat<T extends LayerLike>(
  srcLayers: T[],
  srcW: number,
  srcH: number,
  tgtW: number,
  tgtH: number,
): T[] {
  const sx = tgtW / srcW
  const sy = tgtH / srcH

  return srcLayers.map((l) => {
    const n: T = JSON.parse(JSON.stringify(l))
    n.x = Math.round(l.x * sx)
    n.y = Math.round(l.y * sy)
    n.w = Math.round(l.w * sx)
    n.h = Math.round(l.h * sy)
    if (n.type === 'bg') {
      n.w = tgtW
      n.h = tgtH
    }
    if (n.fontSize) {
      n.fontSize = Math.max(7, Math.round(n.fontSize * Math.min(sx, sy)))
    }
    return n
  })
}
