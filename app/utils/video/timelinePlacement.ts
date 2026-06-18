// timelinePlacement.ts — PURE helpers for placing new clips on a timeline track.
// Fixes the "every added clip lands on the playhead and stacks at 0s" UX bug:
// when the desired range collides with an existing clip on the target track, the
// new clip is appended after the furthest clip end instead of overlapping.
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'

export function resolveClipStartSec(
  timeline: TimelineState | null | undefined,
  kind: 'video' | 'overlay' | 'caption',
  desiredStartSec: number,
  durationSec: number
): number {
  const start = Math.max(0, desiredStartSec)
  const track = timeline?.tracks.find(t => t.kind === kind)
  if (!track?.clips.length) return start

  const spans = track.clips.map((c) => {
    const clipStart = c.timeline_start_sec
    const clipDuration = 'duration_sec' in c ? Math.max(0, c.duration_sec) : 0
    return { start: clipStart, end: clipStart + clipDuration }
  })
  const end = start + Math.max(0, durationSec)
  const overlaps = spans.some(span => start < span.end && end > span.start)
  if (!overlaps) return start
  return Math.max(start, ...spans.map(span => span.end))
}
