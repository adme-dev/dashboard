import { describe, expect, it } from 'vitest'
import { timelineDockSize, timelineFitScale, timelineRulerIntervals, TIMELINE_END_PADDING } from '../../app/utils/banner-workspace'

describe('Banner Studio timeline sizing', () => {
  it('allocates more room to tracks on desktop and fits shorter screens', () => {
    expect(timelineDockSize(1088)).toEqual({ min: 248, max: 640, height: 457 })
    expect(timelineDockSize(560)).toEqual({ min: 224, max: 358, height: 235 })
    expect(timelineDockSize(300).height).toBeLessThan(180)
  })

  it('honors a height preference when there is room and clamps it in a short editor', () => {
    expect(timelineDockSize(1088, 568).height).toBe(568)
    expect(timelineDockSize(560, 568).height).toBe(358)
    expect(timelineDockSize(1088, 100).height).toBe(248)
  })

  it('fits a short sequence into the track viewport without changing its duration', () => {
    const width = 1470
    const duration = 7.2
    expect(timelineFitScale(duration, width) * duration + TIMELINE_END_PADDING).toBeCloseTo(width)
  })

  it('spaces out the markers at lower scales and keeps detailed ticks when zoomed in', () => {
    expect(timelineRulerIntervals(120)).toEqual({ label: 1, tick: 0.1 })
    const scale = timelineFitScale(300, 880)
    const { label, tick } = timelineRulerIntervals(scale)
    expect(label * scale).toBeGreaterThanOrEqual(40)
    expect(tick).toBeGreaterThan(1)
  })
})
