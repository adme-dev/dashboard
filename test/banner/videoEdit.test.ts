import { describe, expect, it } from 'vitest'
import {
  videoFrameTimes,
  videoTrimRange,
  validVideoTrim
} from '../../app/utils/banner-video-edit'

describe('video trimming', () => {
  it('uses source duration and clamps legacy out-of-range trim values', () => {
    expect(videoTrimRange({}, 8)).toEqual([0, 8])
    expect(videoTrimRange({ mediaStart: 2, mediaEnd: 5 }, 8)).toEqual([2, 5])
    expect(videoTrimRange({ mediaStart: -1, mediaEnd: 20 }, 8)).toEqual([0, 8])
    expect(
      validVideoTrim(...videoTrimRange({ mediaStart: 30, mediaEnd: 1 }, 8), 8)
    ).toBe(true)
    expect(videoTrimRange({}, Infinity)).toEqual([0, 0])
  })
  it.each([
    [0, 0, 8],
    [-1, 3, 8],
    [3, 2, 8],
    [0, 9, 8],
    [NaN, 3, 8],
    [0, Infinity, Infinity]
  ])(
    'rejects invalid source range %s–%s with duration %s',
    (start, end, duration) => {
      expect(validVideoTrim(start, end, duration)).toBe(false)
    }
  )
  it('samples the source clock at layer-relative times, including loops and held frames', () => {
    expect(videoFrameTimes({ mediaStart: 2, mediaEnd: 4 }, 8, 4, 4)).toEqual([
      2.5, 3.5, 4, 4
    ])
    expect(
      videoFrameTimes({ mediaStart: 2, mediaEnd: 4, mediaLoop: true }, 8, 4, 4)
    ).toEqual([2.5, 3.5, 2.5, 3.5])
    expect(videoFrameTimes({}, 8, 30, 100)).toHaveLength(12)
    expect(Math.max(...videoFrameTimes({}, 8, 30))).toBeLessThan(8)
    expect(videoFrameTimes({}, Infinity, 4)).toEqual([])
  })
})
