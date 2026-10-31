import { describe, expect, it } from 'vitest'
import { timelinePhases } from '~/utils/banner-timeline-phases'
import type { Layer } from '~/types/banner-studio'

describe('read-only timeline phase summaries', () => {
  it('shows imported entry, hold and exit at their actual keyframe boundaries', () => {
    const layer = { type: 'image', startTime: 5, endTime: 10, keyframes: {
      opacity: [{ time: 5, value: 0 }, { time: 6, value: 0.3 }, { time: 9, value: 0.3 }, { time: 10, value: 0 }],
      scaleX: [{ time: 5, value: 8 }, { time: 5.8, value: 1 }, { time: 10, value: 1 }]
    } } as Layer
    const original = JSON.stringify(layer)
    expect(timelinePhases(layer)).toEqual([
      { kind: 'entry', start: 5, end: 6, label: 'Entry · Keyframes', direction: 'in' },
      { kind: 'hold', start: 6, end: 9, label: 'Hold', direction: 'in' },
      { kind: 'exit', start: 9, end: 10, label: 'Exit · Keyframes', direction: 'out' }
    ])
    expect(JSON.stringify(layer)).toBe(original)
  })
  it('does not invent preset names for continuous or repeated imported motion', () => {
    const layer = { type: 'image', startTime: 0, endTime: 3, keyframes: {
      opacity: [{ time: 0, value: 0 }, { time: 1, value: 1 }, { time: 1, value: 0 }, { time: 2, value: 1 }, { time: 2, value: 0 }, { time: 3, value: 1 }]
    } } as Layer
    expect(timelinePhases(layer)).toEqual([{ kind: 'motion', start: 0, end: 3, label: 'Motion · Keyframes', direction: 'in' }])
    expect(layer.keyframes!.opacity).toHaveLength(6)
  })
  it('keeps static keyframes and audio as full presence ranges', () => {
    expect(timelinePhases({ type: 'image', startTime: 2, endTime: 6, keyframes: { opacity: [{ time: 2, value: 0.15 }, { time: 6, value: 0.15 }] } } as Layer)).toEqual([{ kind: 'hold', start: 2, end: 6, label: 'Hold', direction: 'in' }])
    expect(timelinePhases({ type: 'audio', startTime: 6, endTime: 10 } as Layer)).toEqual([{ kind: 'audio', start: 6, end: 10, label: 'Sound', direction: 'in' }])
  })
  it('uses known preset names without expanding short effects beyond their durations', () => {
    const phases = timelinePhases({ type: 'text', startTime: 1, endTime: 5, animIn: 'zoomIn', animInDur: 0.15, animOut: 'fadeOut', outDur: 0.25 } as Layer)
    expect(phases.map(p => [p.label, p.start, p.end])).toEqual([['Entry · Zoom In', 1, 1.15], ['Hold', 1.15, 4.75], ['Exit · Fade', 4.75, 5]])
  })
  it('labels independent path motion even when the property tracks are constant', () => {
    expect(timelinePhases({ type: 'image', startTime: 0, endTime: 3, motionPath: [{ x: 0, y: 0 }, { x: 200, y: 50 }], keyframes: { opacity: [{ time: 0, value: 1 }, { time: 3, value: 1 }] } } as Layer)[0]?.label).toBe('Motion path')
  })
  it('preserves the actual exit when staggered word entrances overlap it', () => {
    const phases = timelinePhases({ type: 'text', text: 'One two three four five six', startTime: 0, endTime: 3,
      animIn: 'fadeIn', animInDur: 0.5, animOut: 'fadeOut', outDur: 0.25,
      wordPop: { duration: 0.5, stagger: 0.5, ease: 'none' }
    } as Layer)
    expect(phases.map(p => [p.label, p.start, p.end])).toEqual([
      ['Entry · Words Pop', 0, 3], ['Exit · Fade', 2.75, 3]
    ])
  })
})
