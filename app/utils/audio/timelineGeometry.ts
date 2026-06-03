// app/utils/audio/timelineGeometry.ts — PURE pixel geometry for the read-only lane
// view. Time → x/width at a fixed pxPerSec zoom. No DOM, no Vue — unit-testable.
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'

/** A scheduled clip's lane rectangle. durationSec null → use fallbackDurSec
 * (the engine's resolved duration for play-to-end clips). */
export function clipRect(
  clip: { timelineStartSec: number; durationSec: number | null },
  pxPerSec: number,
  fallbackDurSec: number
): { x: number; width: number } {
  const dur = clip.durationSec ?? fallbackDurSec
  return { x: clip.timelineStartSec * pxPerSec, width: Math.max(0, dur) * pxPerSec }
}

/** Playhead x for the current master-clock position (clamped at 0). */
export function playheadX(currentTimeSec: number, pxPerSec: number): number {
  return Math.max(0, currentTimeSec) * pxPerSec
}

/** Number of lanes to render (one per track, muted included). */
export function trackLaneCount(timeline: TimelineState): number {
  return timeline.tracks.length
}

/** Inverse of playheadX: convert a pixel offset (from the left edge of the clip
 * canvas, NOT including the label column) back to a timeline time in seconds. */
export function timeAtX(px: number, pxPerSec: number): number {
  if (pxPerSec <= 0) return 0
  return Math.max(0, px / pxPerSec)
}
