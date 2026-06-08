/**
 * Clip-path utilities for banner mask layers.
 *
 * Converts mask bounds to CSS clip-path values relative to the target layer's
 * coordinate space. Two variants:
 *  - computeClipPath()   → percentage units (reactive editor binding)
 *  - computeClipPathPx() → pixel units (HTML export)
 */

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Compute CSS clip-path (percentage units) for a masked layer.
 */
export function computeClipPath(
  mask: Rect,
  target: Rect,
  shape: 'rect' | 'ellipse',
  invert: boolean,
): string {
  // Convert mask bounds to target's local coordinate space (percentages)
  const left = ((mask.x - target.x) / target.w) * 100
  const top = ((mask.y - target.y) / target.h) * 100
  const right = 100 - (((mask.x + mask.w) - target.x) / target.w) * 100
  const bottom = 100 - (((mask.y + mask.h) - target.y) / target.h) * 100

  if (shape === 'ellipse') {
    const rx = (mask.w / target.w) * 50
    const ry = (mask.h / target.h) * 50
    const cx = left + (mask.w / target.w) * 50
    const cy = top + (mask.h / target.h) * 50
    return `ellipse(${rx}% ${ry}% at ${cx}% ${cy}%)`
  }

  // Rect shape → inset()
  const t = Math.max(0, top)
  const r = Math.max(0, right)
  const b = Math.max(0, bottom)
  const l = Math.max(0, left)

  if (invert) {
    // Polygon ring: outer rect with inner cutout
    const il = Math.max(0, Math.min(100, left))
    const it = Math.max(0, Math.min(100, top))
    const ir = Math.max(0, Math.min(100, 100 - right))
    const ib = Math.max(0, Math.min(100, 100 - bottom))
    return `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${il}% ${it}%, ${il}% ${ib}%, ${ir}% ${ib}%, ${ir}% ${it}%, ${il}% ${it}%)`
  }

  return `inset(${t}% ${r}% ${b}% ${l}%)`
}

/**
 * Compute CSS clip-path (pixel units) for HTML export.
 */
export function computeClipPathPx(
  mask: Rect,
  target: Rect,
  shape: 'rect' | 'ellipse',
  invert: boolean,
): string {
  const left = mask.x - target.x
  const top = mask.y - target.y
  const right = target.w - (mask.x + mask.w - target.x)
  const bottom = target.h - (mask.y + mask.h - target.y)

  if (shape === 'ellipse') {
    const rx = mask.w / 2
    const ry = mask.h / 2
    const cx = left + rx
    const cy = top + ry
    return `ellipse(${rx}px ${ry}px at ${cx}px ${cy}px)`
  }

  const t = Math.max(0, top)
  const r = Math.max(0, right)
  const b = Math.max(0, bottom)
  const l = Math.max(0, left)

  if (invert) {
    const il = Math.max(0, Math.min(target.w, left))
    const it = Math.max(0, Math.min(target.h, top))
    const ir = Math.max(0, Math.min(target.w, target.w - right))
    const ib = Math.max(0, Math.min(target.h, target.h - bottom))
    return `polygon(0px 0px, ${target.w}px 0px, ${target.w}px ${target.h}px, 0px ${target.h}px, 0px 0px, ${il}px ${it}px, ${il}px ${ib}px, ${ir}px ${ib}px, ${ir}px ${it}px, ${il}px ${it}px)`
  }

  return `inset(${t}px ${r}px ${b}px ${l}px)`
}
