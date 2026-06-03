import { describe, it, expect } from 'vitest'
import { clipRect, playheadX, trackLaneCount, timeAtX } from '~~/app/utils/audio/timelineGeometry'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'

describe('clipRect', () => {
  it('maps timeline start/duration to x/width at the given pxPerSec', () => {
    expect(clipRect({ timelineStartSec: 2, durationSec: 5 }, 10, 0)).toEqual({ x: 20, width: 50 })
  })
  it('uses the fallback duration when durationSec is null', () => {
    expect(clipRect({ timelineStartSec: 0, durationSec: null }, 10, 8)).toEqual({ x: 0, width: 80 })
  })
  it('never returns a negative width', () => {
    expect(clipRect({ timelineStartSec: 0, durationSec: -3 }, 10, 0)).toEqual({ x: 0, width: 0 })
  })
})

describe('playheadX', () => {
  it('scales the current time by pxPerSec, clamped at 0', () => {
    expect(playheadX(3, 10)).toBe(30)
    expect(playheadX(-1, 10)).toBe(0)
  })
})

describe('timeAtX', () => {
  it('inverts playheadX: px / pxPerSec → seconds', () => {
    expect(timeAtX(300, 100)).toBe(3)
    expect(timeAtX(0, 100)).toBe(0)
  })
  it('clamps negative px to 0 seconds', () => {
    expect(timeAtX(-50, 100)).toBe(0)
  })
  it('guards against division-by-zero (pxPerSec=0 → 0)', () => {
    expect(timeAtX(100, 0)).toBe(0)
  })
})

describe('trackLaneCount', () => {
  it('counts all tracks (muted included — they still get a lane)', () => {
    const s = TimelineStateSchema.parse({ tracks: [
      { id: 'a', name: 'A', kind: 'voiceover', clips: [] },
      { id: 'b', name: 'B', kind: 'music', muted: true, clips: [] }
    ] })
    expect(trackLaneCount(s)).toBe(2)
  })
})
