import { expect, it } from 'vitest'
import type { Layer } from '~/types/banner-studio'
import { addMiddleAnimation } from '~/utils/banner-timeline-edit'
import { canRemoveTimelineAnimation, removeTimelineAnimation } from '~/utils/banner-timeline-remove'
import { timelinePhases } from '~/utils/banner-timeline-phases'
const layer = { id: 1, type: 'image', name: 'Car', opacity: 1, animIn: 'bounceIn', animOut: 'fadeOut', animInDur: 0.6, outDur: 0.5, startTime: 0, endTime: 4 } as Layer
it('removes a native entrance or exit without changing the layer or opposite effect', () => {
  const phases = timelinePhases(layer)
  expect(removeTimelineAnimation(layer, phases[0]!, () => 1)).toEqual({ animIn: 'none', animInStart: undefined, wordPop: undefined })
  expect(removeTimelineAnimation(layer, phases.at(-1)!, () => 1)).toEqual({ animOut: 'none', animOutStart: undefined })
  expect(canRemoveTimelineAnimation(layer, phases[1])).toBe(false)
})
it('removes Pulse and keeps the entrance, fade exit and independent tracks unchanged', () => {
  const opacity = [{ time: 0, value: 0 }, { time: 0.6, value: 1 }, { time: 3.5, value: 1 }, { time: 4, value: 0 }]
  const source = { ...layer, keyframes: { opacity } }
  const animated = { ...source, ...addMiddleAnimation(source, { kind: 'hold', start: 0.6, end: 3.5, label: 'Hold', direction: 'in' }, 'pulse', 1, source.keyframes, () => 1) }
  const pulse = timelinePhases(animated).find(phase => phase.label === 'Pulsate')!
  expect(pulse).toBeTruthy()
  const removed = { ...animated, ...removeTimelineAnimation(animated, pulse, () => 1) }
  expect(removed.keyframes.opacity).toEqual(opacity)
  expect(removed.keyframes.scaleX!.every(frame => frame.value === 1)).toBe(true)
  expect(removed.keyframes.scaleY!.every(frame => frame.value === 1)).toBe(true)
  expect(timelinePhases(removed).some(phase => phase.label === 'Pulsate')).toBe(false)
  expect(timelinePhases(removed).at(-1)!.kind).toBe('exit')
})
it('removes custom entrance opacity without hiding the image or losing its exit', () => {
  const source = { ...layer, keyframes: { opacity: [{ time: 0, value: 0 }, { time: 0.6, value: 1 }, { time: 3.5, value: 1 }, { time: 4, value: 0 }] } }
  const result = removeTimelineAnimation(source, timelinePhases(source)[0]!, () => 1)
  expect(result.keyframes!.opacity![0]!.value).toBe(1)
  expect(result.keyframes!.opacity!.slice(-2)).toEqual(source.keyframes.opacity.slice(-2))
})
it('does not erase a motion path or an audio clip through an animation removal', () => {
  const source = { ...layer, motionPath: [{ x: 0, y: 0 }, { x: 100, y: 100 }], keyframes: { x: [{ time: 0, value: 0 }, { time: 4, value: 100 }] } }
  expect(canRemoveTimelineAnimation(source, { kind: 'motion', start: 0, end: 4, label: 'Motion path', direction: 'in' })).toBe(false)
  expect(canRemoveTimelineAnimation({ ...layer, type: 'audio' }, timelinePhases(layer)[0])).toBe(false)
})

it('recognises and removes imported repeated opacity pulses, including equal-time reset anchors', () => {
  const opacity = [{ time: 0, value: 0 }, { time: 1, value: 1 }, ...Array.from({ length: 11 }, (_, i) => ({ time: 3.5 + i * 0.35, value: i % 2 ? 0.2 : 1 })), { time: 7.1, value: 0.2 }, { time: 7.1, value: 1 }, { time: 8.4, value: 1 }]
  const source = { ...layer, endTime: 8.4, keyframes: { opacity } }
  const pulse = timelinePhases(source).find(phase => phase.label.includes('Pulsing opacity'))!
  expect(pulse).toMatchObject({ kind: 'motion', start: 3.5, end: 7.1 })
  const removed = { ...source, ...removeTimelineAnimation(source, pulse, () => 1) }
  expect(removed.keyframes.opacity.slice(0, 2)).toEqual(opacity.slice(0, 2))
  expect(removed.keyframes.opacity.at(-1)).toEqual({ time: 8.4, value: 1 })
  expect(timelinePhases(removed).some(phase => phase.kind === 'motion')).toBe(false)
})
