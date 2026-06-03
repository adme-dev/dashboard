import { describe, it, expect, vi } from 'vitest'
import { createAudioEngine } from '~~/app/composables/useAudioEngine'

// Minimal mock ctx — reused from the SP2a engine test file (makeMockCtx pattern).
function makeMockCtx() {
  const ctx: any = {
    currentTime: 0,
    destination: { id: 'dest' },
    state: 'suspended',
    resume: vi.fn(async () => { ctx.state = 'running' }),
    createGain() {
      return { gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }
    },
    createBufferSource() {
      return { buffer: null as any, connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), onended: null }
    }
  }
  return ctx
}

describe('createAudioEngine — clipSourceDuration', () => {
  it('reports a decoded clip source duration after load', async () => {
    const state = {
      schema_version: 1, media_type: 'audio', sample_rate: 48000, duration_sec: 0,
      tracks: [{ id: 't', name: 't', kind: 'voiceover', gain_db: 0, muted: false, locked: false, hidden: false,
        clips: [{ id: 'c1', asset_id: null, r2_key: 'k', timeline_start_sec: 0, source_in_sec: 0,
          source_out_sec: null, gain_db: 0, fade_in_sec: 0, fade_out_sec: 0, fade_curve: 'linear' }] }],
      ducking: []
    } as any
    const engine = createAudioEngine({
      ctx: makeMockCtx(),
      resolveBuffer: async () => ({ duration: 7 }),
      setTimer: () => () => {},
      now: () => 0
    })
    await engine.load(state)
    expect(engine.clipSourceDuration('c1')).toBe(7)
  })

  it('returns 0 for an unknown clip id', async () => {
    const engine = createAudioEngine({
      ctx: makeMockCtx(),
      resolveBuffer: async () => ({ duration: 5 }),
      setTimer: () => () => {},
      now: () => 0
    })
    expect(engine.clipSourceDuration('nonexistent')).toBe(0)
  })
})
