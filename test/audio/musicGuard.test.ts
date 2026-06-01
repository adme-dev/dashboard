import { describe, it, expect } from 'vitest'
import { guardAudioPrompt } from '~~/server/utils/audio/musicGuard'

describe('guardAudioPrompt', () => {
  it('passes a clean genre/mood brief', () => {
    const r = guardAudioPrompt('upbeat indie pop, 120 bpm, bright and summery')
    expect(r.safe).toBe(true)
    expect(r.violations).toEqual([])
    expect(r.sanitized).toBe('upbeat indie pop, 120 bpm, bright and summery')
  })

  it('strips an "in the style of <artist>" clause and flags it', () => {
    const r = guardAudioPrompt('summery pop in the style of Taylor Swift, 120 bpm')
    expect(r.safe).toBe(false)
    expect(r.violations.some(v => /taylor swift/i.test(v))).toBe(true)
    expect(r.sanitized.toLowerCase()).not.toContain('taylor swift')
    expect(r.sanitized.toLowerCase()).not.toContain('in the style of')
  })

  it('catches a bare blocklisted artist name anywhere in the brief', () => {
    const r = guardAudioPrompt('a Drake type beat with heavy 808s')
    expect(r.safe).toBe(false)
    expect(r.violations).toContain('drake')
    expect(r.sanitized.toLowerCase()).not.toContain('drake')
  })

  it('collapses whitespace left by removals', () => {
    const r = guardAudioPrompt('chill   sounds like   Adele   vibe')
    expect(r.sanitized).not.toMatch(/\s{2,}/)
  })
})
