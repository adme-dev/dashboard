import { MotionPathPlugin } from 'gsap/MotionPathPlugin'
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
 * Convert waypoints to an SVG path `d` attribute using GSAP's own MotionPathPlugin
 * spline (`pointsToSegment`), so the editor overlay is exactly what plays back.
 * `curviness` (0-2): 0 = straight segments, 1 = smooth, 2 = very curvy.
 * Note: with only 2 points the spline is always a straight line — curviness needs
 * a 3rd waypoint to bend around.
 */
export function catmullRomToSvgPath(
  points: { x: number; y: number }[],
  curviness: number = 1,
): string {
  if (points.length < 2) return ''
  if (points.length === 2 || curviness <= 0) {
    return 'M ' + points.map(p => `${p.x} ${p.y}`).join(' L ')
  }
  const flat = points.flatMap(p => [p.x, p.y])
  const seg = MotionPathPlugin.pointsToSegment(flat, curviness)
  return MotionPathPlugin.rawPathToString([seg])
}

function buildRawPath(points: { x: number; y: number }[], curviness: number) {
  const d = catmullRomToSvgPath(points, curviness)
  if (!d) return null
  const raw = MotionPathPlugin.getRawPath(d)
  MotionPathPlugin.cacheRawPathMeasurements(raw)
  return raw
}

/** Position (absolute coords, same space as `points`) at progress 0-1 along the path. */
export function motionPathPositionAt(
  points: { x: number; y: number }[],
  curviness: number,
  progress: number,
): { x: number; y: number; angle: number } | null {
  const raw = buildRawPath(points, curviness)
  if (!raw) return null
  const p = MotionPathPlugin.getPositionOnPath(raw, Math.max(0, Math.min(1, progress)), true) as any
  return { x: p.x, y: p.y, angle: p.angle ?? 0 }
}

/** SVG `d` for the [start,end] progress slice of the path (for highlighting one tween's segment). */
export function motionPathSliceSvg(
  points: { x: number; y: number }[],
  curviness: number,
  start: number,
  end: number,
): string {
  const raw = buildRawPath(points, curviness)
  if (!raw) return ''
  const sliced = MotionPathPlugin.sliceRawPath(raw, Math.min(start, end), Math.max(start, end))
  return MotionPathPlugin.rawPathToString(sliced)
}

/**
 * Which tween does a waypoint belong to? Waypoint i sits at progress i/(n-1) (approximation:
 * GSAP's spline is measured by arc length, but this is what users expect when clicking a point).
 * Returns the index of the tween whose path range ends at/contains that progress.
 */
export function tweenIndexForWaypoint(
  pointIndex: number,
  pointCount: number,
  tweens: { pathStart: number; pathEnd: number }[],
): number {
  if (pointCount < 2 || !tweens.length) return 0
  const progress = pointIndex / (pointCount - 1)
  const eps = 1e-6
  // Prefer the tween that ENDS here (the keyframe the point represents), then containing one
  const ending = tweens.findIndex(t => Math.abs(t.pathEnd - progress) < eps)
  if (ending >= 0) return ending
  const containing = tweens.findIndex(t => progress >= t.pathStart - eps && progress <= t.pathEnd + eps)
  return containing >= 0 ? containing : tweens.length - 1
}
