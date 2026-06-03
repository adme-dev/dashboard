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

export function deleteClip(state: TimelineState, { clipId }: { clipId: string }): TimelineState {
  const next = cloneState(state)
  for (const track of next.tracks) track.clips = track.clips.filter(c => c.id !== clipId)
  next.duration_sec = computeDuration(next)
  return next
}

export function addClip(
  state: TimelineState,
  { trackId, id, asset, startSec }:
    { trackId: string; id: string; asset: { id: string; r2_key_master: string }; startSec: number }
): TimelineState {
  const next = cloneState(state)
  const track = next.tracks.find(t => t.id === trackId)
  if (!track) return state
  track.clips.push({
    id, asset_id: asset.id, r2_key: asset.r2_key_master,
    timeline_start_sec: Math.max(0, startSec), source_in_sec: 0, source_out_sec: null,
    gain_db: 0, fade_in_sec: 0, fade_out_sec: 0, fade_curve: 'linear'
  })
  next.duration_sec = computeDuration(next)
  return next
}

export function moveClip(
  state: TimelineState,
  { clipId, toTrackId, newStartSec }: { clipId: string; toTrackId: string; newStartSec: number }
): TimelineState {
  const next = cloneState(state)
  let moved: Clip | undefined
  for (const track of next.tracks) {
    const i = track.clips.findIndex(c => c.id === clipId)
    if (i >= 0) { moved = track.clips.splice(i, 1)[0]; break }
  }
  if (!moved) return state
  moved.timeline_start_sec = Math.max(0, newStartSec)
  const dest = next.tracks.find(t => t.id === toTrackId)
  if (!dest) return state // unknown track → no-op
  dest.clips.push(moved)
  next.duration_sec = computeDuration(next)
  return next
}
