import { describe, it, expect } from 'vitest'
import { toDisplayLanes, type DisplayClip } from '~~/app/utils/audio/timelineDisplay'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'
import type { ScheduledClip } from '~~/app/utils/audio/audioSchedulePlanner'

describe('toDisplayLanes', () => {
  const state = {
    schema_version: 2, media_type: 'av', sample_rate: 48000, fps: 30, width: 1080, height: 1920,
    duration_sec: 6, ducking: [],
    tracks: [
      { id: 'vid', name: 'Video', kind: 'video', gain_db: 0, muted: false, locked: false, hidden: false, clips: [
        { type: 'video', id: 'v1', asset_id: null, r2_key: 'f.mp4', timeline_start_sec: 0, source_in_sec: 0, source_out_sec: null, duration_sec: 5, base_source: 'uploaded_footage', kenburns: null, audio_mode: 'mute' }
      ] },
      { id: 'ov', name: 'Overlay', kind: 'overlay', gain_db: 0, muted: false, locked: false, hidden: false, clips: [
        { type: 'overlay', id: 'o1', timeline_start_sec: 1, duration_sec: 4, gsap_project_id: 'b1', gsap_format_key: 'fb_story', opacity: 1 }
      ] },
      { id: 'vo', name: 'VO', kind: 'voiceover', gain_db: 0, muted: false, locked: false, hidden: false, clips: [] }
    ]
  } as unknown as TimelineState

  const scheduled: ScheduledClip[] = [
    { clipId: 'a1', trackId: 'vo', r2_key: 'vo.mp3', timelineStartSec: 0, sourceInSec: 0, durationSec: 3, gainDb: 0, fadeInSec: 0, fadeOutSec: 0, fadeCurve: 'linear' }
  ]

  it('maps video lanes from raw clips and audio lanes from ScheduledClips', () => {
    const lanes = toDisplayLanes(state, scheduled)
    expect(lanes.map(l => l.id)).toEqual(['vid', 'ov', 'vo'])

    const vid = lanes[0].clips[0]
    expect(vid).toMatchObject<Partial<DisplayClip>>({ clipId: 'v1', trackId: 'vid', kind: 'video', timelineStartSec: 0, durationSec: 5, r2_key: 'f.mp4', baseSource: 'uploaded_footage' })

    const ov = lanes[1].clips[0]
    expect(ov).toMatchObject<Partial<DisplayClip>>({ clipId: 'o1', trackId: 'ov', kind: 'overlay', timelineStartSec: 1, durationSec: 4 })

    const vo = lanes[2].clips[0]
    expect(vo).toMatchObject<Partial<DisplayClip>>({ clipId: 'a1', trackId: 'vo', kind: 'audio', timelineStartSec: 0, durationSec: 3, r2_key: 'vo.mp3' })
  })

  it('treats voiceover/music/sfx tracks as audio and reads ScheduledClips for them', () => {
    const lanes = toDisplayLanes(state, scheduled)
    expect(lanes.find(l => l.id === 'vo')!.clips[0].kind).toBe('audio')
  })
})
