// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import gsap from 'gsap'
import { addEndAnimation } from '../../app/utils/banner-timeline-edit'
import { timelinePhases } from '../../app/utils/banner-timeline-phases'
import { bannerAnimationTiming } from '../../app/utils/banner-animation-timing'
import { useBannerTimeline } from '../../app/composables/useBannerTimeline'
import { buildBannerHTML } from '../../app/utils/banner-html-builder'
import { buildBannerHTML as buildServerHTML } from '../../server/utils/banner/htmlBuilder'
import type { Layer } from '../../app/types/banner-studio'

const image = { id: 1, type: 'image', name: 'Car', src: '/car.png', x: 0, y: 0, w: 100, h: 100, zIndex: 1, opacity: 0.6, animIn: 'fadeIn', animInDur: 0.6, animOut: 'none', startTime: 0, endTime: 4 } as Layer
const motion = { ...image, keyframes: { x: [{ time: 0, value: 0 }, { time: 4, value: 40 }], opacity: [{ time: 0, value: 0 }, { time: 0.6, value: 0.6 }, { time: 4, value: 0.6 }] } } as Layer
const faded = [image, motion].map(layer => ({ ...layer, ...addEndAnimation(layer, 'fadeOut', () => 0.6) }))
afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren() })

it('adds a resizable exit without removing the entrance or imported movement', () => {
  expect(faded[0]!.animIn).toBe('fadeIn')
  expect(timelinePhases(faded[0]!).at(-1)).toMatchObject({ kind: 'exit', start: 3.5, end: 4 })
  expect(faded[1]!.keyframes!.x).toEqual(motion.keyframes!.x)
  expect(faded[1]!.keyframes!.opacity!.slice(0, 2)).toEqual(motion.keyframes!.opacity!.slice(0, 2))
  expect(timelinePhases(faded[1]!).at(-1)).toMatchObject({ kind: 'exit', start: 3.5, end: 4, label: 'Exit · Fade' })
  expect(motion.keyframes!.opacity!.at(-1)!.value).toBe(0.6)
})

it('keeps the fade within short layer boundaries even if the entrance overlaps', () => {
  const short = { ...image, startTime: 2, endTime: 2.2 }
  expect(bannerAnimationTiming({ ...short, ...addEndAnimation(short, 'fadeOut') })).toMatchObject({ exitStart: 2, exitDuration: expect.closeTo(0.2) })
})

it.each(faded)('editor fades $name at its end and can seek backwards', layer => {
  const state = { sets: { mrec: { layers: [layer] } }, activeKey: 'mrec', currentTime: 0, duration: 4, isPlaying: false, isLooping: false }
  vi.stubGlobal('useBannerStudio', () => ({ state, activeLayers: ref([layer]) }))
  const board = document.createElement('div')
  board.innerHTML = '<div id="lyr-1"></div>'
  document.body.append(board)
  const controller = useBannerTimeline()
  try {
    controller.buildTimeline(board, [layer])
    controller.seekTo(3.5)
    expect(Number(gsap.getProperty(board.firstElementChild!, 'opacity'))).toBeCloseTo(0.6)
    controller.seekTo(3.75)
    expect(Number(gsap.getProperty(board.firstElementChild!, 'opacity'))).toBeGreaterThan(0)
    expect(Number(gsap.getProperty(board.firstElementChild!, 'opacity'))).toBeLessThan(0.6)
    controller.seekTo(4)
    expect(Number(gsap.getProperty(board.firstElementChild!, 'opacity'))).toBe(0)
    controller.seekTo(1)
    expect(Number(gsap.getProperty(board.firstElementChild!, 'opacity'))).toBeCloseTo(0.6)
  } finally { controller.destroyTimeline() }
})

it.each([['client', buildBannerHTML], ['server', buildServerHTML]] as const)('%s export retains both preset and imported-keyframe end fades', (_, build) => {
  for (const layer of faded) {
    const board = document.createElement('div')
    board.innerHTML = '<div data-id="1" style="opacity:0.6"></div>'
    document.body.append(board)
    const html = build('mrec', [layer], { playback: { duration: 4, loopCount: 1 } })
    const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(code => code!.includes('const tl ='))!
    const output = {} as { __engagrTimeline?: gsap.core.Timeline }
    try {
      new Function('gsap', 'window', script)(gsap, output)
      const timeline = output.__engagrTimeline!.pause()
      timeline.totalTime(3.5, true)
      expect(Number(gsap.getProperty(board.firstElementChild!, 'opacity'))).toBeCloseTo(0.6)
      timeline.totalTime(3.75, true)
      expect(Number(gsap.getProperty(board.firstElementChild!, 'opacity'))).toBeGreaterThan(0)
      expect(Number(gsap.getProperty(board.firstElementChild!, 'opacity'))).toBeLessThan(0.6)
      timeline.totalTime(4, true)
      expect(Number(gsap.getProperty(board.firstElementChild!, 'opacity'))).toBe(0)
    } finally { output.__engagrTimeline?.kill(); board.remove() }
  }
})
