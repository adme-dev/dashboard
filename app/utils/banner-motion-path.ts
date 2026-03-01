import type { MotionPathPoint } from '~/types/banner-studio'

/**
 * Convert relative motion path offsets to absolute artboard coordinates.
 */
export function motionPathToAbsolute(
  points: MotionPathPoint[],
  layerX: number,
  layerY: number,
): { x: number; y: number }[] {
  return points.map(pt => ({
    x: layerX + pt.x,
    y: layerY + pt.y,
  }))
}

/**
 * Convert waypoints to SVG path `d` attribute using Catmull-Rom → cubic bezier conversion.
 * `curviness` (0-2) controls tension: 0 = sharp corners, 1 = smooth, 2 = very curvy.
 */
export function catmullRomToSvgPath(
  points: { x: number; y: number }[],
  curviness: number = 1,
): string {
  if (points.length < 2) return ''
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`
  }

  const parts: string[] = [`M ${points[0].x} ${points[0].y}`]
  const t = curviness / 6

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]

    // Control point 1 = P1 + (P2 - P0) * curviness/6
    const cp1x = p1.x + (p2.x - p0.x) * t
    const cp1y = p1.y + (p2.y - p0.y) * t

    // Control point 2 = P2 - (P3 - P1) * curviness/6
    const cp2x = p2.x - (p3.x - p1.x) * t
    const cp2y = p2.y - (p3.y - p1.y) * t

    parts.push(`C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)} ${cp2x.toFixed(1)} ${cp2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`)
  }

  return parts.join(' ')
}
