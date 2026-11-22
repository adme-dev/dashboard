import { describe, expect, it } from 'vitest'
import {
  TIMELINE_DOCK_MAX,
  TIMELINE_DOCK_MIN,
  formatRulerLabel,
  horizontalScrollbarHeight,
  resolveTimelineDockHeight,
  rulerTickInterval,
  rulerTicks,
  stepTimelineDockHeight,
  timelineNaturalHeight
} from '~~/app/utils/audio/timelineLayout'

describe('ruler tick spacing', () => {
  it('keeps labelled ticks at least 48px apart at every zoom', () => {
    for (const pps of [0.04, 1, 4, 8.7, 20, 60, 100, 400, 800]) {
      const interval = rulerTickInterval(pps)
      // Either labels are readable, or we are on the coarsest interval available.
      expect(interval * pps >= 48 || interval === 3600).toBe(true)
    }
  })

  it('picks the finest readable interval rather than a pane-width fraction', () => {
    expect(rulerTickInterval(400)).toBe(0.25)
    expect(rulerTickInterval(100)).toBe(0.5)
    expect(rulerTickInterval(60)).toBe(1)
    expect(rulerTickInterval(20)).toBe(5)
    // 40s fitted into a 360px phone pane (~6 px/s) → 10s ticks, not 1s ticks overlapping.
    expect(rulerTickInterval(6)).toBe(10)
    expect(rulerTickInterval(1)).toBe(60)
  })

  it('formats labels without rounding sub-second ticks into duplicates', () => {
    expect(formatRulerLabel(0, 1)).toBe('0s')
    expect(formatRulerLabel(0.5, 0.5)).toBe('0.5s')
    expect(formatRulerLabel(1.25, 0.25)).toBe('1.25s')
    expect(formatRulerLabel(45, 5)).toBe('45s')
    expect(formatRulerLabel(65, 5)).toBe('1:05')
    expect(formatRulerLabel(60.5, 0.5)).toBe('1:00.5')
    expect(formatRulerLabel(120, 60)).toBe('2:00')
  })

  it('lists ticks across the duration with unique labels', () => {
    // The 40s label would sit on the canvas edge and overflow it, so it is skipped.
    const ticks = rulerTicks(40, 6)
    expect(ticks.map(t => t.label)).toEqual(['0s', '10s', '20s', '30s'])
    const fine = rulerTicks(2, 100)
    expect(new Set(fine.map(t => t.label)).size).toBe(fine.length)
    expect(fine.map(t => t.sec)).toEqual([0, 0.5, 1, 1.5])
    // A tick with room for its label at the end is kept.
    expect(rulerTicks(45, 6).map(t => t.label).at(-1)).toBe('40s')
  })
})

describe('timeline dock height', () => {
  it('derives the natural height from the track count', () => {
    expect(timelineNaturalHeight(2, 40)).toBe(40 + 24 + 2 * 56 + 2)
    expect(timelineNaturalHeight(5, 40)).toBe(40 + 24 + 5 * 56 + 2)
    // An empty timeline still reserves one lane row.
    expect(timelineNaturalHeight(0, 40)).toBe(timelineNaturalHeight(1, 40))
    // A classic horizontal scrollbar must not cover the last lane.
    expect(timelineNaturalHeight(2, 40, 15)).toBe(timelineNaturalHeight(2, 40) + 15)
    expect(horizontalScrollbarHeight(217, 200)).toBe(15)
    expect(horizontalScrollbarHeight(202, 200)).toBe(0)
    expect(horizontalScrollbarHeight(0, 0)).toBe(0)
  })

  it('gives the preview the unused height when there are few tracks', () => {
    const twoTracks = resolveTimelineDockHeight({ naturalHeight: timelineNaturalHeight(2, 40), viewportHeight: 900 })
    const fiveTracks = resolveTimelineDockHeight({ naturalHeight: timelineNaturalHeight(5, 40), viewportHeight: 900 })
    expect(twoTracks).toBe(178)
    expect(fiveTracks).toBeGreaterThan(twoTracks)
    // Many tracks never take more than the desktop viewport share.
    expect(resolveTimelineDockHeight({ naturalHeight: timelineNaturalHeight(12, 40), viewportHeight: 900 })).toBe(360)
  })

  it('allows a larger share on phones, includes dock chrome, and respects the minimum', () => {
    expect(resolveTimelineDockHeight({ naturalHeight: 600, viewportHeight: 700, phone: true })).toBe(350)
    expect(resolveTimelineDockHeight({ naturalHeight: 600, viewportHeight: 700 })).toBe(280)
    expect(resolveTimelineDockHeight({ naturalHeight: 178, chromeHeight: 48, viewportHeight: 900 })).toBe(226)
    expect(resolveTimelineDockHeight({ naturalHeight: 60, viewportHeight: 900 })).toBe(TIMELINE_DOCK_MIN)
    expect(resolveTimelineDockHeight({ naturalHeight: 600, viewportHeight: 200 })).toBe(TIMELINE_DOCK_MIN)
  })

  it('always honours a manual size over the automatic one', () => {
    expect(resolveTimelineDockHeight({ naturalHeight: 178, manualHeight: 320, viewportHeight: 900 })).toBe(320)
    expect(resolveTimelineDockHeight({ naturalHeight: 600, manualHeight: 150, viewportHeight: 900 })).toBe(150)
    // Same 40svh cap as before for a stored desktop size.
    expect(resolveTimelineDockHeight({ naturalHeight: 178, manualHeight: 600, viewportHeight: 900 })).toBe(360)
  })

  it('falls back until the timeline has been measured', () => {
    expect(resolveTimelineDockHeight({ naturalHeight: null, viewportHeight: 900 })).toBe(196)
  })

  it('steps the dock with separator keys inside the dock range', () => {
    expect(stepTimelineDockHeight(200, 'ArrowUp')).toBe(224)
    expect(stepTimelineDockHeight(200, 'ArrowDown')).toBe(176)
    expect(stepTimelineDockHeight(150, 'PageDown')).toBe(TIMELINE_DOCK_MIN)
    expect(stepTimelineDockHeight(630, 'ArrowUp')).toBe(TIMELINE_DOCK_MAX)
    expect(stepTimelineDockHeight(300, 'Home')).toBe(TIMELINE_DOCK_MIN)
    expect(stepTimelineDockHeight(300, 'End')).toBe(TIMELINE_DOCK_MAX)
    expect(stepTimelineDockHeight(300, 'Enter')).toBeNull()
  })
})
