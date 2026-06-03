// app/utils/audio/timelineEdit.ts — PURE timeline edit operations. Each returns a NEW
// TimelineState (no mutation of the input), recomputes duration_sec, and stays SP0-valid.
// New clip ids are passed in by the caller (deterministic → testable). No DOM, no Vue.
import type { TimelineState, Track, Clip } from '~~/server/utils/audio/timelineSchema'
import { computeDuration } from '~~/server/utils/audio/timelineSchema'

export type EditableState = TimelineState

/** Deep clone + recompute duration_sec. sourceDurations lets play-to-end clips
 * (source_out_sec === null) contribute their decoded length. */
export function cloneState(state: TimelineState, sourceDurations: Record<string, number> = {}): TimelineState {
  const copy: TimelineState = structuredClone(state)
  copy.duration_sec = computeDuration(copy, sourceDurations)
  return copy
}

function findClip(state: TimelineState, clipId: string): { track: Track; clip: Clip } | null {
  for (const track of state.tracks) {
    const clip = track.clips.find(c => c.id === clipId)
    if (clip) return { track, clip }
  }
  return null
}
