// app/utils/audio/timelineDisplay.ts — PURE. Unifies the audio scheduler's ScheduledClips
// and the raw video/overlay clips from the timeline into one DisplayClip[] per lane, so
// MediaTimeline can render every track kind with the kind-agnostic geometry helpers.
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'
import type { ScheduledClip } from '~~/app/utils/audio/audioSchedulePlanner'

export interface DisplayClip {
  clipId: string
  trackId: string
  timelineStartSec: number
  durationSec: number | null
  kind: 'audio' | 'video' | 'overlay'
  /** audio + video clips carry an r2_key (waveform / poster). Overlay clips do not. */
  r2_key?: string
  baseSource?: 'uploaded_footage' | 'still_kenburns'
  label: string
}

export interface DisplayLane {
  id: string
  name: string
  kind: string
  muted: boolean
  clips: DisplayClip[]
}

/** Map a timeline + its audio ScheduledClips into per-lane DisplayClips.
 * Audio lanes (voiceover/music/sfx) read ScheduledClips (preserving the waveform path);
 * video/overlay lanes read the raw timeline clips. */
export function toDisplayLanes(timeline: TimelineState, scheduled: ScheduledClip[]): DisplayLane[] {
  const byTrack = new Map<string, ScheduledClip[]>()
  for (const sc of scheduled) {
    const list = byTrack.get(sc.trackId) ?? []
    list.push(sc)
    byTrack.set(sc.trackId, list)
  }

  return timeline.tracks.map((t) => {
    const isVideo = t.kind === 'video'
    const isOverlay = t.kind === 'overlay'
    let clips: DisplayClip[]
    if (isVideo || isOverlay) {
      clips = t.clips.map((c: any): DisplayClip => ({
        clipId: c.id,
        trackId: t.id,
        timelineStartSec: c.timeline_start_sec,
        durationSec: c.duration_sec ?? null,
        kind: isVideo ? 'video' : 'overlay',
        r2_key: c.r2_key,
        baseSource: c.base_source,
        label: isVideo
          ? (c.base_source === 'still_kenburns' ? 'Still' : 'Footage')
          : 'Overlay'
      }))
    } else {
      clips = (byTrack.get(t.id) ?? []).map((sc): DisplayClip => ({
        clipId: sc.clipId,
        trackId: sc.trackId,
        timelineStartSec: sc.timelineStartSec,
        durationSec: sc.durationSec,
        kind: 'audio',
        r2_key: sc.r2_key,
        label: sc.clipId
      }))
    }
    return { id: t.id, name: t.name, kind: t.kind, muted: t.muted, clips }
  })
}
