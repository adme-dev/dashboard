import { describe, expect, it } from 'vitest'
import { describeKeyframeMotion, timelinePhases } from '~/utils/banner-timeline-phases'
import type { Layer } from '~/types/banner-studio'

describe('read-only timeline phase summaries', () => {
  it('shows imported entry, hold and exit at their actual keyframe boundaries', () => {
    const layer = { type: 'image', startTime: 5, endTime: 10, keyframes: {
      opacity: [{ time: 5, value: 0 }, { time: 6, value: 0.3 }, { time: 9, value: 0.3 }, { time: 10, value: 0 }],
      scaleX: [{ time: 5, value: 8 }, { time: 5.8, value: 1 }, { time: 10, value: 1 }]
    } } as Layer
    const original = JSON.stringify(layer)
    expect(timelinePhases(layer)).toEqual([
      { kind: 'entry', start: 5, end: 6, label: 'Entry · Fade in + Scale down', direction: 'in' },
      { kind: 'hold', start: 6, end: 9, label: 'Hold', direction: 'in' },
      { kind: 'exit', start: 9, end: 10, label: 'Exit · Fade out', direction: 'out' }
    ])
    expect(JSON.stringify(layer)).toBe(original)
  })
  it('does not invent preset names for continuous or repeated imported motion', () => {
    const layer = { type: 'image', startTime: 0, endTime: 3, keyframes: {
      opacity: [{ time: 0, value: 0 }, { time: 1, value: 1 }, { time: 1, value: 0 }, { time: 2, value: 1 }, { time: 2, value: 0 }, { time: 3, value: 1 }]
    } } as Layer
    expect(timelinePhases(layer)).toEqual([{ kind: 'motion', start: 0, end: 3, label: 'Motion · Fade', direction: 'in' }])
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

it('names only the properties changing within the clicked interval and keeps the source untouched', () => {
  const layer = { startTime: 0, endTime: 6, keyframes: {
    opacity: [{ time: 0, value: 0 }, { time: 1, value: 1 }, { time: 5, value: 1 }, { time: 6, value: 0 }],
    x: [{ time: 0, value: -100 }, { time: 1, value: 0 }, { time: 6, value: 0 }],
    scaleX: [{ time: 0, value: 0.5 }, { time: 1, value: 1 }, { time: 6, value: 1 }],
    rotation: [{ time: 0, value: 0 }, { time: 1, value: 45 }, { time: 6, value: 45 }]
  } } as Layer
  const before = JSON.stringify(layer)
  expect(describeKeyframeMotion(layer, 0, 1)).toBe('Fade in + Move right + Scale up + Rotate')
  expect(describeKeyframeMotion(layer, 5, 6)).toBe('Fade out')
  expect(JSON.stringify(layer)).toBe(before)
})

it.each([
  ['x', [100, 0], 'Move left'], ['y', [100, 0], 'Move up'], ['y', [-100, 0], 'Move down'],
  ['scaleY', [2, 1], 'Scale down'], ['scaleX', [1, -1], 'Scale'], ['rotation', [0, 90], 'Rotate']
] as const)('describes %s changes with a useful property label', (property, values, expected) => {
  expect(describeKeyframeMotion({ startTime: 0, endTime: 1, keyframes: { [property]: [{ time: 0, value: values[0] }, { time: 1, value: values[1] }] } } as Layer)).toBe(expected)
})

it('keeps named authored blocks and ignores XY keyframes overridden by a motion path', () => {
  const layer = { startTime: 0, endTime: 4, motionPath: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
    keyframes: { x: [{ time: 0, value: 0 }, { time: 4, value: 100 }], opacity: [{ time: 0, value: 0 }, { time: 1, value: 1 }, { time: 4, value: 1 }] },
    animationClips: [{ start: 1, end: 3, label: 'Blink' }]
  } as Layer
  expect(describeKeyframeMotion(layer, 0, 1)).toBe('Fade in + Motion path')
  expect(timelinePhases(layer).some(phase => phase.label === 'Blink')).toBe(true)
})
