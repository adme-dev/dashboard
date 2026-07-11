// app/utils/audio/audioSchedulePlanner.ts — PURE Web-Audio schedule planner.
// No I/O. Turns an SP0 TimelineState into the timed events the engine adapter
// (useAudioEngine.ts) and the offline preview both consume — so preview, live
// playback, and (via the shared contract) the SP1 ffmpeg render all agree.
// Mirrors the render-side timelineFiltergraph.ts on the contract; this is the
// browser-side compilation (gain ramps instead of sidechaincompress, since Web
// Audio has no sidechain — OSS prior-art §1).
import type { AudioClip, Clip, TimelineState } from '~~/server/utils/audio/timelineSchema'

export interface TrackBus {
  trackId: string
  gainDb: number
}

export interface ScheduledClip {
  clipId: string
  trackId: string
  r2_key: string
  timelineStartSec: number
  sourceInSec: number
  durationSec: number | null // null = play to source end (adapter fills from the decoded buffer)
  gainDb: number
  fadeInSec: number
  fadeOutSec: number
  fadeCurve: 'linear' | 'exp' | 'log'
}

export interface DuckRamp {
  targetTrackId: string
  atSec: number      // timeline time the ramp starts
  toGainDb: number   // DELTA from the target bus's nominal gain: amount_db (duck) or 0 (restore)
  rampSec: number    // attack (down) or release (restore), seconds
}

export interface TimelinePlan {
  tracks: TrackBus[]
  clips: ScheduledClip[]
  ramps: DuckRamp[]
}

function isAudioClip(clip: Clip): clip is AudioClip {
  return (clip as { type?: string }).type == null || clip.type === 'audio'
}

/** Decibels → linear amplitude. -Infinity → 0. Shared by the engine + preview gain math. */
export function dbToGain(db: number): number {
  return db === -Infinity ? 0 : Math.pow(10, db / 20)
}

/** Pure: TimelineState → ordered track buses + timed clips + ducking ramps.
 * Muted tracks are dropped entirely (parity with SP1). Ramps added in Task 2. */
export function planTimeline(state: TimelineState): TimelinePlan {
  const active = state.tracks.filter((t) => !t.muted)

  const tracks: TrackBus[] = active.map((t) => ({ trackId: t.id, gainDb: t.gain_db }))

  const clips: ScheduledClip[] = []
  for (const track of active) {
    for (const clip of track.clips) {
      // V1.3: the audio engine schedules ONLY audio clips. Video/overlay clips have no
      // decodable audio buffer (overlays have no r2_key at all). Missing `type` ===
      // legacy audio clip (addClip omits it), so only EXPLICIT video/overlay are skipped.
      if (!isAudioClip(clip)) continue
      clips.push({
        clipId: clip.id,
        trackId: track.id,
        r2_key: clip.r2_key,
        timelineStartSec: clip.timeline_start_sec,
        sourceInSec: clip.source_in_sec,
        durationSec: clip.source_out_sec != null ? clip.source_out_sec - clip.source_in_sec : null,
        gainDb: clip.gain_db,
        fadeInSec: clip.fade_in_sec,
        fadeOutSec: clip.fade_out_sec,
        fadeCurve: clip.fade_curve
      })
    }
  }
  clips.sort((a, b) => a.timelineStartSec - b.timelineStartSec)

  // Ducking → scheduled gain ramps on the target bus at each source-clip boundary.
  const activeIds = new Set(active.map((t) => t.id))
  const ramps: DuckRamp[] = []
  for (const rule of state.ducking) {
    // Skip if either side is muted/absent (no bus to ramp / no trigger audio).
    if (!activeIds.has(rule.source_track_id) || !activeIds.has(rule.target_track_id)) continue
    const sourceTrack = active.find((t) => t.id === rule.source_track_id)!
    for (const clip of sourceTrack.clips) {
      if (!isAudioClip(clip)) continue
      const start = clip.timeline_start_sec
      ramps.push({ targetTrackId: rule.target_track_id, atSec: start, toGainDb: rule.amount_db, rampSec: rule.attack_ms / 1000 })
      // Restore only when the source clip's end is known; null-out clips get their
      // restore filled by the adapter once the decoded buffer duration is available.
      if (clip.source_out_sec != null) {
        const end = start + (clip.source_out_sec - clip.source_in_sec)
        ramps.push({ targetTrackId: rule.target_track_id, atSec: end, toGainDb: 0, rampSec: rule.release_ms / 1000 })
      }
    }
  }
  ramps.sort((a, b) => a.atSec - b.atSec)

  return { tracks, clips, ramps }
}

/** Pure lookahead slice: clips whose start ∈ [fromSec, toSec) and ramps whose
 * atSec ∈ [fromSec, toSec). The per-tick heart of the scheduler loop. */
export function windowEvents(plan: TimelinePlan, fromSec: number, toSec: number): { clips: ScheduledClip[]; ramps: DuckRamp[] } {
  return {
    clips: plan.clips.filter((c) => c.timelineStartSec >= fromSec && c.timelineStartSec < toSec),
    ramps: plan.ramps.filter((r) => r.atSec >= fromSec && r.atSec < toSec)
  }
}
