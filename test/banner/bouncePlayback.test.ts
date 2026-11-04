// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import gsap from 'gsap'
import { useBannerTimeline, presetToKeyframes } from '~/composables/useBannerTimeline'
import { timelinePhases } from '~/utils/banner-timeline-phases'
import { addMiddleAnimation } from '~/utils/banner-timeline-edit'
import { applyTimelineEntrance } from '~/utils/banner-timeline-presets'
import { buildBannerHTML } from '~/utils/banner-html-builder'
import { buildBannerHTML as buildServerHTML } from '~~/server/utils/banner/htmlBuilder'
import type { Layer } from '~/types/banner-studio'
const base = { id: 1, type: 'image', name: 'Car', src: '/car.png', x: 0, y: 0, w: 100, h: 100, zIndex: 1, opacity: 1, animIn: 'none', animOut: 'none', startTime: 0, endTime: 4, animInDur: 0.6 } as Layer
afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren() })
it('Bounce visibly rebounds in editor playback and survives conversion to keyframes', () => {
  const layer = { ...base, ...applyTimelineEntrance(base, 'bounceIn') }
  const state = { sets: { mrec: { layers: [layer] } }, activeKey: 'mrec', currentTime: 0, duration: 4, isPlaying: false, isLooping: false }
  vi.stubGlobal('useBannerStudio', () => ({ state, activeLayers: ref([layer]) }))
  const board = document.createElement('div'); board.innerHTML = '<div id="lyr-1"></div>'; document.body.append(board)
  const controller = useBannerTimeline()
  try {
    for (const candidate of [layer, { ...layer, keyframes: presetToKeyframes(layer) }]) {
      controller.buildTimeline(board, [candidate])
      controller.seekTo(0.24); const before = Number(gsap.getProperty(board.firstElementChild!, 'y'))
      controller.seekTo(0.36); const rebound = Number(gsap.getProperty(board.firstElementChild!, 'y'))
      expect(rebound).toBeGreaterThan(before)
      controller.seekTo(0.6); expect(Number(gsap.getProperty(board.firstElementChild!, 'y'))).toBeCloseTo(0)
    }
  } finally { controller.destroyTimeline() }
})
it.each([['client', buildBannerHTML], ['server', buildServerHTML]] as const)('%s export preserves the selected Bounce easing', (_, build) => {
  const layer = { ...base, ...applyTimelineEntrance(base, 'bounceIn') }
  const board = document.createElement('div'); board.innerHTML = '<div data-id="1" style="opacity:1"></div>'; document.body.append(board)
  const html = build('mrec', [layer], { playback: { duration: 4, loopCount: 1 } })
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(code => code!.includes('const tl ='))!
  const output = {} as { __engagrTimeline?: gsap.core.Timeline }
  try {
    new Function('gsap', 'window', script)(gsap, output)
    const timeline = output.__engagrTimeline!.pause()
    timeline.totalTime(0.24, true); const before = Number(gsap.getProperty(board.firstElementChild!, 'y'))
    timeline.totalTime(0.36, true); expect(Number(gsap.getProperty(board.firstElementChild!, 'y'))).toBeGreaterThan(before)
  } finally { output.__engagrTimeline?.kill() }
})
it('adding keyframe motion to a static image keeps its first frame visible', () => {
  expect(presetToKeyframes(base).opacity![0]).toMatchObject({ time: 0, value: 1 })
})

it('Elastic carries its overshooting easing through keyframe conversion', () => {
  const layer = { ...base, ...applyTimelineEntrance(base, 'elastic') }
  expect(layer.ease).toBe('elastic.out(1,0.3)')
  expect(presetToKeyframes(layer).scaleX![0]!.easing).toBe('elastic.out(1,0.3)')
  expect(gsap.parseEase(layer.ease!)(0.4)).toBeGreaterThan(1)
})

it('Pulse grows and returns to its resting scale in actual editor playback', () => {
  const layer = { ...base, ...addMiddleAnimation(base, { kind: 'hold', start: 0, end: 4, label: 'Hold', direction: 'in' }, 'pulse', 1, presetToKeyframes(base), () => 1) }
  const state = { sets: { mrec: { layers: [layer] } }, activeKey: 'mrec', currentTime: 0, duration: 4, isPlaying: false, isLooping: false }
  vi.stubGlobal('useBannerStudio', () => ({ state, activeLayers: ref([layer]) }))
  const board = document.createElement('div'); board.innerHTML = '<div id="lyr-1"></div>'; document.body.append(board)
  const controller = useBannerTimeline()
  try {
    controller.buildTimeline(board, [layer])
    controller.seekTo(1.6)
    expect(Number(gsap.getProperty(board.firstElementChild!, 'scaleX'))).toBeCloseTo(1.08)
    controller.seekTo(2.2)
    expect(Number(gsap.getProperty(board.firstElementChild!, 'scaleX'))).toBeCloseTo(1)
  } finally { controller.destroyTimeline() }
})

it('Blink repeats the reference opacity behaviour using editable keyframes', () => {
  const layer = { ...base, ...addMiddleAnimation(base, { kind: 'hold', start: 0, end: 4, label: 'Hold', direction: 'in' }, 'blink', 1, presetToKeyframes(base), () => 1) }
  const state = { sets: { mrec: { layers: [layer] } }, activeKey: 'mrec', currentTime: 0, duration: 4, isPlaying: false, isLooping: false }
  vi.stubGlobal('useBannerStudio', () => ({ state, activeLayers: ref([layer]) }))
  const board = document.createElement('div'); board.innerHTML = '<div id="lyr-1"></div>'; document.body.append(board)
  const controller = useBannerTimeline()
  try {
    controller.buildTimeline(board, [layer])
    for (const [time, expected] of [[1, 1], [1.3, 0.2], [1.6, 1], [1.9, 0.2], [2.2, 1]]) {
      controller.seekTo(time!)
      expect(Number(gsap.getProperty(board.firstElementChild!, 'opacity'))).toBeCloseTo(expected!)
    }
    expect(layer.animationClips![0]!.label).toBe('Blink')
  } finally { controller.destroyTimeline() }
})

it('converting a no-exit preset does not invent a fade or revive stale clip labels', () => {
  const source = { ...base, ...applyTimelineEntrance(base, 'bounceIn'), animationClips: [{ start: 3, end: 3.2, label: 'Old Blink' }] }
  const frames = presetToKeyframes(source)
  expect(frames.opacity!.at(-1)).toMatchObject({ time: 4, value: 1 })
  const result = addMiddleAnimation(source, { kind: 'hold', start: 0.6, end: 4, label: 'Hold', direction: 'in' }, 'blink', 1, frames, () => 1)
  expect(result.animationClips!.map(clip => clip.label)).toEqual(['Entry · Bounce', 'Blink'])
  expect(result.keyframes!.opacity!.at(-1)).toMatchObject({ time: 4, value: 1 })
})

it('does not split a fractional boundary into a phantom zero-duration animation block', () => {
  const source = { ...base, ...applyTimelineEntrance(base, 'bounceIn') }
  const result = { ...source, ...addMiddleAnimation(source, { kind: 'hold', start: 0.6, end: 4, label: 'Hold', direction: 'in' }, 'blink', 0.6, presetToKeyframes(source), () => 1) }
  expect(timelinePhases(result).map(phase => [phase.label, phase.start, phase.end])).toEqual([['Entry · Bounce', 0, 0.6], ['Blink', 0.6, 1.8], ['Hold', 1.8, 4]])
})
