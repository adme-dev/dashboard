import { describe, it, expect } from 'vitest'
import { createAudioEngine } from '~~/app/composables/useAudioEngine'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'

function mockCtx() {
  return {
    currentTime: 0,
    state: 'running',
    destination: {},
    createGain: () => ({ gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} })
  }
}

describe('audio engine duration floor', () => {
  it('floors durationSec at state.duration_sec for a video-only AV timeline (no audio clips)', async () => {
    const engine = createAudioEngine({
      ctx: mockCtx() as any,
      resolveBuffer: async () => ({ duration: 0 }),
      setTimer: () => () => {}
    })
    const state = {
      schema_version: 2, media_type: 'av', sample_rate: 48000, fps: 30, width: 1080, height: 1920,
      duration_sec: 8, ducking: [],
      tracks: [{ id: 'vid', name: 'Video', kind: 'video', gain_db: 0, muted: false, locked: false, hidden: false, clips: [
        { type: 'video', id: 'v1', asset_id: null, r2_key: 'f.mp4', timeline_start_sec: 0, source_in_sec: 0, source_out_sec: null, duration_sec: 8, base_source: 'uploaded_footage', kenburns: null, audio_mode: 'mute' }
      ] }]
    } as unknown as TimelineState
    await engine.load(state)
    expect(engine.duration()).toBe(8)
  })

  it('does not shorten an audio timeline whose decoded buffers exceed state.duration_sec', async () => {
    const engine = createAudioEngine({
      ctx: mockCtx() as any,
      resolveBuffer: async () => ({ duration: 10 }),
      setTimer: () => () => {}
    })
    const state = {
      schema_version: 1, media_type: 'audio', sample_rate: 48000, duration_sec: 0, ducking: [],
      tracks: [{ id: 'm', name: 'Music', kind: 'music', gain_db: 0, muted: false, locked: false, hidden: false, clips: [
        { type: 'audio', id: 'a1', asset_id: null, r2_key: 'm.mp3', timeline_start_sec: 0, source_in_sec: 0, source_out_sec: null, gain_db: 0, fade_in_sec: 0, fade_out_sec: 0, fade_curve: 'linear' }
      ] }]
    } as unknown as TimelineState
    await engine.load(state)
    expect(engine.duration()).toBe(10)
  })

  it('advances a video-only AV transport from wall time when AudioContext time is stuck', async () => {
    let now = 100
    const engine = createAudioEngine({
      ctx: mockCtx() as any,
      resolveBuffer: async () => ({ duration: 0 }),
      setTimer: () => () => {},
      now: () => now
    })
    const state = {
      schema_version: 2, media_type: 'av', sample_rate: 48000, fps: 30, width: 1080, height: 1920,
      duration_sec: 8, ducking: [],
      tracks: [{ id: 'vid', name: 'Video', kind: 'video', gain_db: 0, muted: false, locked: false, hidden: false, clips: [
        { type: 'video', id: 'v1', asset_id: null, r2_key: 'f.mp4', timeline_start_sec: 0, source_in_sec: 0, source_out_sec: null, duration_sec: 8, base_source: 'uploaded_footage', kenburns: null, audio_mode: 'mute' }
      ] }]
    } as unknown as TimelineState
    await engine.load(state)
    engine.play()
    now = 102.25
    expect(engine.currentTime()).toBeCloseTo(2.25, 5)
  })
})
