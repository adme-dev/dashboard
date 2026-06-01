import { describe, it, expect } from 'vitest'
import { getMusicQueue, musicIdempotencyKey } from '~~/server/utils/audio/musicJob'

describe('musicIdempotencyKey', () => {
  const base = { createdBy: 'u1', prompt: 'warm acoustic bed', isInstrumental: true, lyrics: null }

  it('is deterministic for the same inputs', () => {
    expect(musicIdempotencyKey(base)).toBe(musicIdempotencyKey({ ...base }))
  })

  it('is prefixed and bounded in length', () => {
    const key = musicIdempotencyKey(base)
    expect(key.startsWith('music:')).toBe(true)
    expect(key.length).toBe('music:'.length + 32)
  })

  it('differs when any salient field changes', () => {
    const k = musicIdempotencyKey(base)
    expect(musicIdempotencyKey({ ...base, createdBy: 'u2' })).not.toBe(k)
    expect(musicIdempotencyKey({ ...base, prompt: 'energetic synthwave' })).not.toBe(k)
    expect(musicIdempotencyKey({ ...base, isInstrumental: false })).not.toBe(k)
    expect(musicIdempotencyKey({ ...base, lyrics: 'la la la' })).not.toBe(k)
  })
})

describe('getMusicQueue', () => {
  it('returns the binding when present', () => {
    const fake = { send: async () => {} }
    const event = { context: { cloudflare: { env: { MUSIC_QUEUE: fake } } } } as any
    expect(getMusicQueue(event)).toBe(fake)
  })

  it('returns null when the binding is absent', () => {
    expect(getMusicQueue({ context: {} } as any)).toBeNull()
  })

  it('never throws on a malformed context', () => {
    expect(getMusicQueue({} as any)).toBeNull()
  })
})
