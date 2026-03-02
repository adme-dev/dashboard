import { describe, it, expect } from 'vitest'
import { catmullRomToSvgPath, motionPathToAbsolute } from '~/app/utils/banner-motion-path'

describe('motionPathToAbsolute', () => {
  it('converts relative offsets to absolute artboard coordinates', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 50, y: -30 },
      { x: 100, y: 0 },
    ]
    const result = motionPathToAbsolute(points, 10, 20)
    expect(result).toEqual([
      { x: 10, y: 20 },
      { x: 60, y: -10 },
      { x: 110, y: 20 },
    ])
  })

  it('handles empty array', () => {
    expect(motionPathToAbsolute([], 100, 200)).toEqual([])
  })

  it('handles single point', () => {
    const result = motionPathToAbsolute([{ x: 5, y: 10 }], 0, 0)
    expect(result).toEqual([{ x: 5, y: 10 }])
  })
})

describe('catmullRomToSvgPath', () => {
  it('returns empty string for fewer than 2 points', () => {
    expect(catmullRomToSvgPath([])).toBe('')
    expect(catmullRomToSvgPath([{ x: 0, y: 0 }])).toBe('')
  })

  it('returns a line for exactly 2 points', () => {
    const result = catmullRomToSvgPath([
      { x: 0, y: 0 },
      { x: 100, y: 50 },
    ])
    expect(result).toBe('M 0 0 L 100 50')
  })

  it('returns cubic bezier curves for 3+ points', () => {
    const result = catmullRomToSvgPath([
      { x: 0, y: 0 },
      { x: 50, y: -30 },
      { x: 100, y: 0 },
    ])
    expect(result).toMatch(/^M 0 0 C/)
    // Should have 2 cubic bezier segments (3 points → 2 segments)
    const cCount = (result.match(/C /g) || []).length
    expect(cCount).toBe(2)
    // Should end at the last point
    expect(result).toMatch(/100\.0 0\.0$/)
  })

  it('generates more segments for more points', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 30, y: -20 },
      { x: 60, y: 10 },
      { x: 90, y: -15 },
      { x: 120, y: 0 },
    ]
    const result = catmullRomToSvgPath(points)
    // 5 points → 4 segments
    const cCount = (result.match(/C /g) || []).length
    expect(cCount).toBe(4)
  })

  it('curviness 0 produces sharper curves (control points closer to data points)', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 50, y: -50 },
      { x: 100, y: 0 },
    ]
    const sharp = catmullRomToSvgPath(points, 0)
    const smooth = catmullRomToSvgPath(points, 2)
    // With curviness 0, control points should equal data points
    // (since t = 0/6 = 0, all control points collapse onto data points)
    // This means the curve is effectively linear
    expect(sharp).not.toBe(smooth)
    // Sharp path should contain the data points as control points
    expect(sharp).toContain('50.0 -50.0')
  })

  it('curviness 0 makes straight-line control points', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 200, y: 0 },
    ]
    const result = catmullRomToSvgPath(points, 0)
    // With curviness 0, CP1 = P1 and CP2 = P2 (no offset)
    // First segment: M 0 0 C 0.0 0.0 100.0 100.0 100.0 100.0
    // Both control points should be at the data points
    expect(result).toMatch(/C 0\.0 0\.0 100\.0 100\.0 100\.0 100\.0/)
  })

  it('handles negative coordinates', () => {
    const points = [
      { x: -50, y: -50 },
      { x: 0, y: 0 },
      { x: 50, y: 50 },
    ]
    const result = catmullRomToSvgPath(points)
    expect(result).toMatch(/^M -50 -50 C/)
    expect(result).toMatch(/50\.0 50\.0$/)
  })
})
