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
  kind: 'audio' | 'video' | 'overlay' | 'caption'
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

/** Optional r2_key → human title map (library asset titles). */
export type ClipTitleMap = Record<string, string | undefined>

// timestamp prefix · trailing uuid · trailing 32-hex · trailing 8-hex short id
const STORAGE_KEY_NOISE = /^\d{10,}-|-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$|-[0-9a-f]{32}$|-[0-9a-f]{8}$/gi

/**
 * Label a clip for the timeline: library title when known, else a cleaned file
 * name ("1781834121263-video-studio-qa-source-cd6bbaad.png" → "video studio qa source"),
 * else the kind. Never a raw UUID.
 */
export function clipDisplayLabel(
  kind: DisplayClip['kind'],
  r2Key: string | null | undefined,
  titles?: ClipTitleMap,
  fallback?: string
): string {
  const title = r2Key ? titles?.[r2Key]?.trim() : ''
  if (title) return title
  const file = (r2Key ?? '').split('/').pop() ?? ''
  const rawStem = file.replace(/\.[^.]+$/, '')
  // A stem that is itself a uuid / hash carries no meaning — fall through to the kind.
  if (/^[0-9a-f-]{32,36}$/i.test(rawStem)) return fallback ?? kindLabel(kind)
  const stem = rawStem.replace(STORAGE_KEY_NOISE, '').replace(/[-_]+/g, ' ').trim()
  if (stem) return stem
  return fallback ?? kindLabel(kind)
}

function kindLabel(kind: DisplayClip['kind']): string {
  return kind === 'audio' ? 'Audio' : kind === 'video' ? 'Footage' : kind === 'overlay' ? 'Overlay' : 'Captions'
}

/** Map a timeline + its audio ScheduledClips into per-lane DisplayClips.
 * Audio lanes (voiceover/music/sfx) read ScheduledClips (preserving the waveform path);
 * video/overlay lanes read the raw timeline clips. */
export function toDisplayLanes(timeline: TimelineState, scheduled: ScheduledClip[], titles?: ClipTitleMap): DisplayLane[] {
  const byTrack = new Map<string, ScheduledClip[]>()
  for (const sc of scheduled) {
    const list = byTrack.get(sc.trackId) ?? []
    list.push(sc)
    byTrack.set(sc.trackId, list)
  }

  return timeline.tracks.map((t) => {
    const isVideo = t.kind === 'video'
    const isOverlay = t.kind === 'overlay'
    const isCaption = t.kind === 'caption'
    let clips: DisplayClip[]
    if (isVideo || isOverlay || isCaption) {
      clips = t.clips.map((c: any): DisplayClip => ({
        clipId: c.id,
        trackId: t.id,
        timelineStartSec: c.timeline_start_sec,
        durationSec: c.duration_sec ?? null,
        kind: isVideo ? 'video' : isOverlay ? 'overlay' : 'caption',
        r2_key: c.r2_key,
        baseSource: c.base_source,
        label: isVideo
          ? clipDisplayLabel('video', c.r2_key, titles, c.base_source === 'still_kenburns' ? 'Still' : 'Footage')
          : isOverlay ? (c.label || titles?.[c.gsap_project_id] || 'Overlay') : 'Captions'
      }))
    } else {
      clips = (byTrack.get(t.id) ?? []).map((sc): DisplayClip => ({
        clipId: sc.clipId,
        trackId: sc.trackId,
        timelineStartSec: sc.timelineStartSec,
        durationSec: sc.durationSec,
        kind: 'audio',
        r2_key: sc.r2_key,
        label: clipDisplayLabel('audio', sc.r2_key, titles, t.kind === 'voiceover' ? 'Voiceover' : t.kind === 'music' ? 'Music' : 'Audio')
      }))
    }
    return { id: t.id, name: t.name, kind: t.kind, muted: t.muted, clips }
  })
}
