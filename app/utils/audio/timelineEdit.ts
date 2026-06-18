// app/utils/audio/timelineEdit.ts — PURE timeline edit operations. Each returns a NEW
// TimelineState (no mutation of the input), recomputes duration_sec, and stays SP0-valid.
// New clip ids are passed in by the caller (deterministic → testable). No DOM, no Vue.
import type { TimelineState, Track, Clip } from '~~/server/utils/audio/timelineSchema'
import { computeDuration } from '~~/server/utils/audio/timelineSchema'

export type EditableState = TimelineState

/** Deep clone + recompute duration_sec. sourceDurations lets play-to-end clips
 * (source_out_sec === null) contribute their decoded length. */
export function cloneState(state: TimelineState, sourceDurations: Record<string, number> = {}): TimelineState {
  // NOTE: deep-clone via JSON, not structuredClone(). The editor passes the live
  // `timeline.value`, which is a Vue reactive Proxy, and Safari's structuredClone()
  // throws `DataCloneError: The object can not be cloned.` on reactive proxies
  // (Chrome reads through them). The timeline state is strictly JSON-serialisable
  // (persisted as JSONB, Zod-validated), so a JSON round-trip is equivalent here
  // and also strips reactivity from the snapshot.
  const copy: TimelineState = JSON.parse(JSON.stringify(state))
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
  // No match → return the original so callers can detect "no change" by reference equality.
  if (!findClip(state, clipId)) return state
  const next = cloneState(state)
  for (const track of next.tracks) track.clips = track.clips.filter(c => c.id !== clipId)
  next.duration_sec = computeDuration(next)
  return next
}

export function snapTime(t: number, targets: number[], pxPerSec: number, thresholdPx = 8): number {
  const windowSec = thresholdPx / pxPerSec
  let best = t, bestDist = windowSec
  for (const target of targets) {
    const d = Math.abs(t - target)
    if (d <= bestDist) { best = target; bestDist = d }
  }
  return best
}

export function sliceClipAt(
  state: TimelineState,
  { clipId, timeSec, leftId, rightId, sourceDurationSec }:
    { clipId: string; timeSec: number; leftId: string; rightId: string; sourceDurationSec: number }
): TimelineState {
  const next = cloneState(state)
  for (const track of next.tracks) {
    const i = track.clips.findIndex(c => c.id === clipId)
    if (i < 0) continue
    const clip = track.clips[i]
    // Play-to-end clips (source_out_sec === null) end at the decoded source length.
    const trueOut = clip.source_out_sec ?? sourceDurationSec
    const endTl = clip.timeline_start_sec + (trueOut - clip.source_in_sec)
    if (timeSec <= clip.timeline_start_sec || timeSec >= endTl) return state // outside → no-op
    const cutSrc = clip.source_in_sec + (timeSec - clip.timeline_start_sec)
    const left: Clip = { ...clip, id: leftId, source_out_sec: cutSrc, fade_out_sec: 0 }
    const right: Clip = { ...clip, id: rightId, timeline_start_sec: timeSec, source_in_sec: cutSrc, fade_in_sec: 0 }
    track.clips.splice(i, 1, left, right)
    next.duration_sec = computeDuration(next)
    return next
  }
  return state
}

export function trimClip(
  state: TimelineState,
  { clipId, edge, newTimeSec, sourceDurationSec }:
    { clipId: string; edge: 'start' | 'end'; newTimeSec: number; sourceDurationSec: number }
): TimelineState {
  const next = cloneState(state)
  const found = next.tracks.flatMap(t => t.clips).find(c => c.id === clipId)
  if (!found) return state
  const srcOut = found.source_out_sec ?? sourceDurationSec
  if (edge === 'end') {
    // timeline delta from the clip start maps 1:1 to source seconds
    const newSrcOut = found.source_in_sec + Math.max(0, newTimeSec - found.timeline_start_sec)
    found.source_out_sec = Math.min(sourceDurationSec, Math.max(found.source_in_sec + 0.01, newSrcOut))
  } else {
    // Clamp the advance to the trimmable range and apply the SAME amount to BOTH
    // fields so source_in_sec and timeline_start_sec never desync (no sliver teleport).
    const maxAdvance = (srcOut - 0.01) - found.source_in_sec
    const advance = Math.max(0, Math.min(newTimeSec - found.timeline_start_sec, maxAdvance))
    found.source_in_sec = found.source_in_sec + advance
    found.timeline_start_sec = found.timeline_start_sec + advance
  }
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

/** Append a new empty track. The id is passed in by the caller (deterministic →
 * testable). name defaults to a capitalised kind when omitted. */
export function addTrack(
  state: TimelineState,
  { id, kind, name }: { id: string; kind: Track['kind']; name?: string }
): TimelineState {
  const next = cloneState(state)
  next.tracks.push({
    id,
    name: name ?? (kind.charAt(0).toUpperCase() + kind.slice(1)),
    kind,
    gain_db: 0,
    muted: false,
    locked: false,
    hidden: false,
    clips: []
  })
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

// ─── V1.3 AV edit helpers ──────────────────────────────────────────────────────
// New clip-kind helpers. The audio addClip/trimClip/sliceClipAt above are LEFT
// UNTOUCHED (they assume source_*/fade_* fields only audio clips have).

const DEFAULT_KENBURNS = { zoom_from: 1, zoom_to: 1.1, pan_from: [0, 0] as [number, number], pan_to: [0, 0] as [number, number] }

/** Append a video clip (uploaded footage or a ken-burns still) to a video track. */
export function addVideoClip(
  state: TimelineState,
  { trackId, id, assetId = null, r2Key, startSec, durationSec, baseSource }:
    { trackId: string; id: string; assetId?: string | null; r2Key: string; startSec: number; durationSec: number; baseSource: 'uploaded_footage' | 'still_kenburns' }
): TimelineState {
  const next = cloneState(state)
  const track = next.tracks.find(t => t.id === trackId)
  if (!track) return state
  track.clips.push({
    type: 'video', id, asset_id: assetId, r2_key: r2Key,
    timeline_start_sec: Math.max(0, startSec),
    source_in_sec: 0, source_out_sec: null,
    duration_sec: Math.max(0.1, durationSec),
    base_source: baseSource,
    kenburns: baseSource === 'still_kenburns' ? { ...DEFAULT_KENBURNS } : null,
    audio_mode: 'mute',
    effects: []
  } as unknown as Clip)
  next.duration_sec = computeDuration(next)
  return next
}

/** Replace the effect preset list on a video clip. No-op (original reference) for
 * unknown clips or non-video clips, so callers can detect "no change". */
export function setClipEffects(state: TimelineState, { clipId, effects }: { clipId: string, effects: string[] }): TimelineState {
  const found = findClip(state, clipId)
  if (!found || (found.clip as { type?: string }).type !== 'video') return state
  const next = cloneState(state)
  for (const track of next.tracks) {
    const clip = track.clips.find(c => c.id === clipId)
    if (clip) (clip as { effects?: string[] }).effects = [...effects]
  }
  return next
}

/** Append an overlay clip (a Banner Studio project + format key) to an overlay track. */
export function addOverlayClip(
  state: TimelineState,
  { trackId, id, gsapProjectId, gsapFormatKey, startSec, durationSec }:
    { trackId: string; id: string; gsapProjectId: string; gsapFormatKey: string | null; startSec: number; durationSec: number }
): TimelineState {
  const next = cloneState(state)
  const track = next.tracks.find(t => t.id === trackId)
  if (!track) return state
  track.clips.push({
    type: 'overlay', id,
    timeline_start_sec: Math.max(0, startSec),
    duration_sec: Math.max(0.1, durationSec),
    gsap_project_id: gsapProjectId,
    gsap_format_key: gsapFormatKey,
    opacity: 1
  } as unknown as Clip)
  next.duration_sec = computeDuration(next)
  return next
}

/** Append a caption clip to a caption track. The renderer burns this text into
 * the final composite; caption style presets are intentionally narrow for now. */
export function addCaptionClip(
  state: TimelineState,
  { trackId, id, text, sourceAssetId = null, captionVttUrl = null, startSec, durationSec, style = 'platform_default' }:
    { trackId: string; id: string; text: string; sourceAssetId?: string | null; captionVttUrl?: string | null; startSec: number; durationSec: number; style?: 'platform_default' | 'bold_social' | 'subtitle_safe' }
): TimelineState {
  const next = cloneState(state)
  const track = next.tracks.find(t => t.id === trackId)
  const captionText = text.trim()
  if (!track || !captionText) return state
  track.clips.push({
    type: 'caption',
    id,
    timeline_start_sec: Math.max(0, startSec),
    duration_sec: Math.max(0.1, durationSec),
    text: captionText,
    source_asset_id: sourceAssetId,
    caption_vtt_url: captionVttUrl,
    style
  } as unknown as Clip)
  next.duration_sec = computeDuration(next)
  return next
}

/** Trim a VIDEO or OVERLAY clip. Overlays + stills resize duration only; footage also
 * shifts source_in_sec on a start-trim so the visible window stays consistent. Audio
 * clips must go through trimClip (this returns state unchanged for them). */
export function trimVisualClip(
  state: TimelineState,
  { clipId, edge, newTimeSec }: { clipId: string; edge: 'start' | 'end'; newTimeSec: number }
): TimelineState {
  const found = findClip(state, clipId)
  if (!found) return state
  const c = found.clip as any
  if (c.type !== 'video' && c.type !== 'overlay' && c.type !== 'caption') return state
  const MIN = 0.1
  const next = cloneState(state)
  const clip = findClip(next, clipId)!.clip as any
  if (edge === 'end') {
    clip.duration_sec = Math.max(MIN, newTimeSec - clip.timeline_start_sec)
    if (clip.type === 'video' && clip.source_out_sec != null) {
      clip.source_out_sec = clip.source_in_sec + clip.duration_sec
    }
  } else {
    const maxAdvance = clip.duration_sec - MIN
    const requested = newTimeSec - clip.timeline_start_sec
    const advance = Math.max(-clip.timeline_start_sec, Math.min(requested, maxAdvance))
    clip.timeline_start_sec = clip.timeline_start_sec + advance
    clip.duration_sec = clip.duration_sec - advance
    if (clip.type === 'video') {
      clip.source_in_sec = Math.max(0, clip.source_in_sec + advance)
      if (clip.source_out_sec != null) clip.source_out_sec = clip.source_in_sec + clip.duration_sec
    }
  }
  next.duration_sec = computeDuration(next)
  return next
}
