import { describe, it, expect } from 'vitest'
import { clipKindOf, nextPollDelay } from '~~/app/composables/useMediaProjectEditor'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'

const state = {
  schema_version: 2, media_type: 'av', sample_rate: 48000, fps: 30, width: 1080, height: 1920,
  duration_sec: 0, ducking: [],
  tracks: [
    { id: 'vid', name: 'Video', kind: 'video', gain_db: 0, muted: false, locked: false, hidden: false, clips: [
      { type: 'video', id: 'v1', r2_key: 'f.mp4', timeline_start_sec: 0, source_in_sec: 0, source_out_sec: null, duration_sec: 5, base_source: 'uploaded_footage', kenburns: null, audio_mode: 'mute' }
    ] },
    { id: 'vo', name: 'VO', kind: 'voiceover', gain_db: 0, muted: false, locked: false, hidden: false, clips: [
      { id: 'a1', r2_key: 'vo.mp3', timeline_start_sec: 0, source_in_sec: 0, source_out_sec: 3, gain_db: 0, fade_in_sec: 0, fade_out_sec: 0, fade_curve: 'linear' }
    ] },
    { id: 'cap', name: 'Captions', kind: 'caption', gain_db: 0, muted: false, locked: false, hidden: false, clips: [
      { type: 'caption', id: 'cap1', timeline_start_sec: 0, duration_sec: 3, text: 'Hello' }
    ] }
  ]
} as unknown as TimelineState

describe('clipKindOf', () => {
  it('returns video for a video clip, audio for a legacy untyped audio clip, null when not found', () => {
    expect(clipKindOf(state, 'v1')).toBe('video')
    expect(clipKindOf(state, 'a1')).toBe('audio')
    expect(clipKindOf(state, 'cap1')).toBe('caption')
    expect(clipKindOf(state, 'nope')).toBeNull()
  })
})

describe('nextPollDelay', () => {
  it('stops (null) for terminal statuses and returns a positive delay otherwise', () => {
    expect(nextPollDelay('done')).toBeNull()
    expect(nextPollDelay('failed')).toBeNull()
    expect(nextPollDelay('queued')).toBeGreaterThan(0)
    expect(nextPollDelay('rendering')).toBeGreaterThan(0)
  })
})
