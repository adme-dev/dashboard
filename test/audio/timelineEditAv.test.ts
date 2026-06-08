import { describe, it, expect } from 'vitest'
import { addVideoClip, addOverlayClip, trimVisualClip } from '~~/app/utils/audio/timelineEdit'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'

function avState(): TimelineState {
  return {
    schema_version: 2, media_type: 'av', sample_rate: 48000, fps: 30, width: 1080, height: 1920,
    duration_sec: 0, ducking: [],
    tracks: [
      { id: 'vid', name: 'Video', kind: 'video', gain_db: 0, muted: false, locked: false, hidden: false, clips: [] },
      { id: 'ov', name: 'Overlay', kind: 'overlay', gain_db: 0, muted: false, locked: false, hidden: false, clips: [] }
    ]
  } as unknown as TimelineState
}

describe('addVideoClip', () => {
  it('adds an uploaded-footage clip with the given duration', () => {
    const next = addVideoClip(avState(), { trackId: 'vid', id: 'v1', r2Key: 'media/p/f.mp4', startSec: 2, durationSec: 6, baseSource: 'uploaded_footage' })
    const clip: any = next.tracks[0].clips[0]
    expect(clip).toMatchObject({ type: 'video', id: 'v1', r2_key: 'media/p/f.mp4', timeline_start_sec: 2, duration_sec: 6, base_source: 'uploaded_footage', kenburns: null, source_in_sec: 0, source_out_sec: null, audio_mode: 'mute' })
    expect(next.duration_sec).toBe(8)
  })

  it('adds a still_kenburns clip with a default kenburns object', () => {
    const next = addVideoClip(avState(), { trackId: 'vid', id: 's1', r2Key: 'media/p/i.jpg', startSec: 0, durationSec: 5, baseSource: 'still_kenburns' })
    const clip: any = next.tracks[0].clips[0]
    expect(clip.base_source).toBe('still_kenburns')
    expect(clip.kenburns).toEqual({ zoom_from: 1, zoom_to: 1.1, pan_from: [0, 0], pan_to: [0, 0] })
  })
})

describe('addOverlayClip', () => {
  it('adds an overlay clip referencing a banner project + format', () => {
    const next = addOverlayClip(avState(), { trackId: 'ov', id: 'o1', gsapProjectId: 'b1', gsapFormatKey: 'fb_story', startSec: 1, durationSec: 4 })
    const clip: any = next.tracks[1].clips[0]
    expect(clip).toMatchObject({ type: 'overlay', id: 'o1', gsap_project_id: 'b1', gsap_format_key: 'fb_story', timeline_start_sec: 1, duration_sec: 4, opacity: 1 })
    expect(next.duration_sec).toBe(5)
  })
})

describe('trimVisualClip', () => {
  it('end-trims an overlay clip by shrinking duration', () => {
    let s = addOverlayClip(avState(), { trackId: 'ov', id: 'o1', gsapProjectId: 'b1', gsapFormatKey: 'fb_story', startSec: 0, durationSec: 5 })
    s = trimVisualClip(s, { clipId: 'o1', edge: 'end', newTimeSec: 3 })
    expect((s.tracks[1].clips[0] as any).duration_sec).toBe(3)
  })

  it('start-trims a footage clip: advances start + source_in and shrinks duration', () => {
    let s = addVideoClip(avState(), { trackId: 'vid', id: 'v1', r2Key: 'f.mp4', startSec: 0, durationSec: 6, baseSource: 'uploaded_footage' })
    s = trimVisualClip(s, { clipId: 'v1', edge: 'start', newTimeSec: 2 })
    const c: any = s.tracks[0].clips[0]
    expect(c.timeline_start_sec).toBe(2)
    expect(c.source_in_sec).toBe(2)
    expect(c.duration_sec).toBe(4)
  })

  it('keeps duration >= 0.1 on an over-aggressive end trim', () => {
    let s = addOverlayClip(avState(), { trackId: 'ov', id: 'o1', gsapProjectId: 'b1', gsapFormatKey: 'fb_story', startSec: 1, durationSec: 5 })
    s = trimVisualClip(s, { clipId: 'o1', edge: 'end', newTimeSec: 0 })
    expect((s.tracks[1].clips[0] as any).duration_sec).toBeCloseTo(0.1, 5)
  })

  it('returns the same reference when the clip id is unknown', () => {
    const s = avState()
    expect(trimVisualClip(s, { clipId: 'nope', edge: 'end', newTimeSec: 3 })).toBe(s)
  })
})
