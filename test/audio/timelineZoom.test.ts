import { describe, expect, it } from 'vitest'
import { clampTimelineZoom, fitTimelineZoom, stepTimelineZoom } from '~~/app/utils/audio/timelineZoom'

describe('timeline zoom helpers', () => {
  it('clamps zoom to supported editor bounds', () => {
    expect(clampTimelineZoom(0)).toBe(10)
    expect(clampTimelineZoom(60)).toBe(60)
    expect(clampTimelineZoom(1000)).toBe(800)
    expect(clampTimelineZoom(Number.NaN)).toBe(10)
  })

  it('fits timeline duration into the usable container width', () => {
    expect(fitTimelineZoom(10, 1120, 120)).toBe(100)
    expect(fitTimelineZoom(0, 1120, 120)).toBe(800)
    expect(fitTimelineZoom(1000, 160, 120)).toBe(10)
  })

  it('steps zoom in and out by the configured factor', () => {
    expect(stepTimelineZoom(60, 'in')).toBe(90)
    expect(stepTimelineZoom(60, 'out')).toBe(40)
    expect(stepTimelineZoom(700, 'in')).toBe(800)
    expect(stepTimelineZoom(12, 'out')).toBe(10)
  })
})
