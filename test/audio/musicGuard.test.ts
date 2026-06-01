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

  it('does not flag a blocklisted name embedded inside another word', () => {
    // 'sia' must not fire inside 'Russia'; 'drake' must not fire inside 'draked'
    const r = guardAudioPrompt('a corporate jingle for our Russian office, modern feel')
    expect(r.safe).toBe(true)
    expect(r.violations).toEqual([])
    expect(r.sanitized).toBe('a corporate jingle for our Russian office, modern feel')
  })

  it('respects a KV-supplied blocklist override and escapes regex metachars', () => {
    const r = guardAudioPrompt('a track like Foo+Bar energetic', ['foo+bar'])
    expect(r.safe).toBe(false)
    expect(r.violations).toContain('foo+bar')
    expect(r.sanitized.toLowerCase()).not.toContain('foo+bar')
  })
})
