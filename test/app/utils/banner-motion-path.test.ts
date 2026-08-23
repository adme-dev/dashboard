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

  // The path is now produced by GSAP's MotionPathPlugin (pointsToSegment +
  // rawPathToString) so the editor overlay matches playback exactly. Assert on
  // geometry (parsed numbers), not on GSAP's serialisation format.
  function parse(d: string) {
    const m = /^M\s*(-?[\d.]+)[ ,](-?[\d.]+)/.exec(d)
    const nums = d.replace(/^M[^C]*/, '').split(/[\s,C]+/).filter(Boolean).map(Number)
    return { start: m ? [Number(m[1]), Number(m[2])] : null, cubics: nums.length / 6, end: nums.slice(-2), nums }
  }

  it('returns cubic bezier curves for 3+ points', () => {
    const result = catmullRomToSvgPath([
      { x: 0, y: 0 },
      { x: 50, y: -30 },
      { x: 100, y: 0 },
    ])
    const p = parse(result)
    expect(result.startsWith('M')).toBe(true)
    expect(result).toContain('C')
    expect(p.start).toEqual([0, 0])
    // 3 points → 2 cubic segments, ending at the last point
    expect(p.cubics).toBe(2)
    expect(p.end).toEqual([100, 0])
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
    expect(parse(result).cubics).toBe(4)
  })

  it('curviness changes the curve shape', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 50, y: -50 },
      { x: 100, y: 0 },
    ]
    const gentle = catmullRomToSvgPath(points, 0.5)
    const smooth = catmullRomToSvgPath(points, 2)
    expect(gentle).not.toBe(smooth)
    // Both pass through the middle waypoint
    expect(parse(gentle).nums).toEqual(expect.arrayContaining([50, -50]))
    expect(parse(smooth).nums).toEqual(expect.arrayContaining([50, -50]))
  })

  it('curviness 0 produces straight segments between waypoints', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 200, y: 0 },
    ]
    const result = catmullRomToSvgPath(points, 0)
    expect(result).toBe('M 0 0 L 100 100 L 200 0')
  })

  it('handles negative coordinates', () => {
    const points = [
      { x: -50, y: -50 },
      { x: 0, y: 0 },
      { x: 50, y: 50 },
    ]
    const p = parse(catmullRomToSvgPath(points))
    expect(p.start).toEqual([-50, -50])
    expect(p.end).toEqual([50, 50])
  })
})
