import { describe, expect, it } from 'vitest'
import { averageLuma, DARK_FRAME_LUMA, isDarkFrame, pickThumbnailFrame, thumbnailCandidateTimes } from '~~/app/utils/video/generatedThumbnail'

describe('thumbnailCandidateTimes', () => {
  it('samples interior frames, midpoint first, never the opening frame', () => {
    expect(thumbnailCandidateTimes(10)).toEqual([5, 3, 7, 1.5])
    for (const t of thumbnailCandidateTimes(10)) expect(t).toBeGreaterThan(0.1)
  })

  it('clamps very short clips away from both ends and de-duplicates', () => {
    const times = thumbnailCandidateTimes(0.4)
    expect(times.every(t => t >= 0.1 && t <= 0.3)).toBe(true)
    expect(new Set(times).size).toBe(times.length)
  })

  it('falls back to a 5s assumption when duration is missing or invalid', () => {
    expect(thumbnailCandidateTimes(null)).toEqual(thumbnailCandidateTimes(5))
    expect(thumbnailCandidateTimes(Number.NaN)).toEqual(thumbnailCandidateTimes(5))
    expect(thumbnailCandidateTimes(Infinity)).toEqual(thumbnailCandidateTimes(5))
  })
})

describe('averageLuma / isDarkFrame', () => {
  it('measures black, white and mid-grey RGBA buffers', () => {
    const fill = (v: number) => new Uint8ClampedArray(Array.from({ length: 16 * 4 }, (_, i) => (i % 4 === 3 ? 255 : v)))
    expect(averageLuma(fill(0), 1)).toBe(0)
    expect(averageLuma(fill(255), 1)).toBeCloseTo(255)
    expect(averageLuma(fill(128), 1)).toBeCloseTo(128)
    expect(isDarkFrame(averageLuma(fill(10), 1))).toBe(true)
    expect(isDarkFrame(averageLuma(fill(DARK_FRAME_LUMA + 10), 1))).toBe(false)
  })

  it('returns 0 for an empty buffer rather than NaN', () => {
    expect(averageLuma([])).toBe(0)
  })
})

describe('pickThumbnailFrame', () => {
  it('skips dark fade-in frames for the first bright sample', () => {
    expect(pickThumbnailFrame([
      { timeSec: 5, luma: 4 },
      { timeSec: 3, luma: 90 }
    ])).toEqual({ timeSec: 3, dark: false, verified: true })
  })

  it('reports an honestly dark clip using its brightest sample', () => {
    expect(pickThumbnailFrame([
      { timeSec: 5, luma: 3 },
      { timeSec: 3, luma: 12 },
      { timeSec: 7, luma: 8 }
    ])).toEqual({ timeSec: 3, dark: true, verified: true })
  })

  it('uses the midpoint unverified when pixels are unreadable (cross-origin storage)', () => {
    expect(pickThumbnailFrame([{ timeSec: 5, luma: null }])).toEqual({ timeSec: 5, dark: false, verified: false })
  })

  it('returns null without samples', () => {
    expect(pickThumbnailFrame([])).toBeNull()
  })
})
