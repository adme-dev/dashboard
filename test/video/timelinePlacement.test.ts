import { describe, expect, it } from 'vitest'
import { resolveClipStartSec } from '~~/app/utils/video/timelinePlacement'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'

function timelineWith(clips: Array<{ start: number, duration: number }>): TimelineState {
  return {
    schema_version: 2,
    media_type: 'av',
    sample_rate: 48000,
    fps: 30,
    width: 1080,
    height: 1920,
    duration_sec: 0,
    ducking: [],
    tracks: [{
      id: 'track-video',
      name: 'Video',
      kind: 'video',
      gain_db: 0,
      muted: false,
      locked: false,
      hidden: false,
      clips: clips.map((c, i) => ({
        type: 'video' as const,
        id: `clip-${i}`,
        asset_id: null,
        r2_key: `key-${i}`,
        timeline_start_sec: c.start,
        source_in_sec: 0,
        source_out_sec: null,
        duration_sec: c.duration,
        base_source: 'uploaded_footage' as const,
        kenburns: null,
        audio_mode: 'mute' as const
      }))
    }]
  }
}

describe('resolveClipStartSec', () => {
  it('keeps the desired start on an empty timeline', () => {
    expect(resolveClipStartSec(timelineWith([]), 'video', 2, 5)).toBe(2)
  })

  it('keeps the desired start when there is no track of the kind', () => {
    const tl = timelineWith([{ start: 0, duration: 5 }])
    expect(resolveClipStartSec(tl, 'overlay', 1, 5)).toBe(1)
  })

  it('keeps the desired start when the range is free', () => {
    const tl = timelineWith([{ start: 0, duration: 5 }])
    expect(resolveClipStartSec(tl, 'video', 5, 5)).toBe(5)
  })

  it('appends after the last clip instead of stacking at the playhead', () => {
    const tl = timelineWith([{ start: 0, duration: 5 }])
    expect(resolveClipStartSec(tl, 'video', 0, 5)).toBe(5)
  })

  it('appends after the furthest clip end when several clips exist', () => {
    const tl = timelineWith([{ start: 0, duration: 5 }, { start: 5, duration: 3 }])
    expect(resolveClipStartSec(tl, 'video', 1, 5)).toBe(8)
  })

  it('never returns a negative start', () => {
    expect(resolveClipStartSec(timelineWith([]), 'video', -3, 5)).toBe(0)
  })

  it('handles a missing timeline', () => {
    expect(resolveClipStartSec(null, 'video', 4, 5)).toBe(4)
  })

  it('appends past an overlapping clip even when the desired start is later than its start', () => {
    const tl = timelineWith([{ start: 0, duration: 10 }])
    expect(resolveClipStartSec(tl, 'video', 4, 5)).toBe(10)
  })
})
