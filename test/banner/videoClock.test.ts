import { describe, expect, it } from 'vitest'
import { bannerVideoMediaTime, bannerVideoMediaTimeScript } from '../../shared/bannerVideoClock'

describe('shared video media clock', () => {
  it('plays at normal speed and holds the final frame of a non-looping clip', () => {
    expect(bannerVideoMediaTime(3, { mediaEnd: 8 })).toBe(3)
    expect(bannerVideoMediaTime(9, { mediaEnd: 8 })).toBe(8)
    expect(bannerVideoMediaTime(-1, { mediaEnd: 8 })).toBe(0)
    expect(bannerVideoMediaTime(12, {}, 4)).toBe(4)
  })

  it('restarts a looping clip at its out-point, including source design repeats', () => {
    const clock = { mediaEnd: 7, mediaLoop: true }
    expect([0, 6.99, 7, 7.01, 9].map(t => Number(bannerVideoMediaTime(t, clock).toFixed(2)))).toEqual([0, 6.99, 0, 0.01, 2])
    expect(bannerVideoMediaTime(1, { mediaStart: 2, mediaEnd: 5, mediaLoop: true })).toBe(3)
    expect(bannerVideoMediaTime(4, { mediaStart: 2, mediaEnd: 5, mediaLoop: true })).toBe(3)
  })

  it('falls back to elapsed time while metadata is unknown', () => {
    expect(bannerVideoMediaTime(5, {})).toBe(5)
  })

  it('emits an export expression identical to the editor clock', () => {
    for (const clock of [{ mediaEnd: 7, mediaLoop: true }, { mediaEnd: 8 }, { mediaStart: 2, mediaEnd: 5, mediaLoop: true }, {}]) {
      const vid = { duration: 6 }
      const exported = new Function('vid', `return ${bannerVideoMediaTimeScript(clock)}`)(vid) as (t: number) => number
      for (const t of [0, 1.25, 6.99, 7, 7.01, 9.9, 15]) expect(exported(t)).toBeCloseTo(bannerVideoMediaTime(t, clock, vid.duration), 10)
    }
  })
})
