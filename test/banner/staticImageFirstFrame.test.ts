// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import gsap from 'gsap'
import { useBannerTimeline } from '../../app/composables/useBannerTimeline'
import { buildBannerHTML } from '../../app/utils/banner-html-builder'
import { buildBannerHTML as buildServerHTML } from '../../server/utils/banner/htmlBuilder'
import type { Layer } from '../../app/types/banner-studio'

const image = { id: 1, type: 'image', name: 'Car', src: '/car.png', x: 0, y: 0, w: 100, h: 100, zIndex: 1, opacity: 0.6, animIn: 'none', animOut: 'none', startTime: 0, endTime: 4 } as Layer
afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren() })

it('shows a newly added static image at time zero and after rebuilding at the same playhead', () => {
  const state = { sets: { mrec: { layers: [image] } }, activeKey: 'mrec', currentTime: 0, duration: 4, isPlaying: false, isLooping: false }
  vi.stubGlobal('useBannerStudio', () => ({ state, activeLayers: ref([image]) }))
  const board = document.createElement('div')
  board.innerHTML = '<div id="lyr-1"></div>'
  document.body.append(board)
  const controller = useBannerTimeline()
  try {
    controller.buildTimeline(board, [image])
    expect(Number(gsap.getProperty(board.firstElementChild!, 'opacity'))).toBeCloseTo(0.6)
    controller.buildTimeline(board, [image])
    expect(state.currentTime).toBe(0)
    expect(Number(gsap.getProperty(board.firstElementChild!, 'opacity'))).toBeCloseTo(0.6)
    const overview = controller.buildTimelineForKey(board, [image], undefined, false)
    expect(Number(gsap.getProperty(board.firstElementChild!, 'opacity'))).toBeCloseTo(0.6)
    overview.kill()
  } finally { controller.destroyTimeline() }
})

it.each([['client', buildBannerHTML], ['server', buildServerHTML]] as const)('%s export shows a static image immediately and preserves a delayed appearance', (_, build) => {
  const delayed = { ...image, id: 2, startTime: 2 }
  const board = document.createElement('div')
  board.innerHTML = '<div data-id="1"></div><div data-id="2"></div>'
  document.body.append(board)
  const html = build('mrec', [image, delayed], { playback: { duration: 4, loopCount: 1 } })
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(code => code!.includes('const tl ='))!
  const output = {} as { __engagrTimeline?: gsap.core.Timeline }
  try {
    new Function('gsap', 'window', script)(gsap, output)
    const timeline = output.__engagrTimeline!.pause()
    timeline.totalTime(0.0001, true).totalTime(0, true)
    expect(Number(gsap.getProperty(board.children[0]!, 'opacity'))).toBeCloseTo(0.6)
    expect(Number(gsap.getProperty(board.children[1]!, 'opacity'))).toBe(0)
    timeline.totalTime(2, true)
    expect(Number(gsap.getProperty(board.children[1]!, 'opacity'))).toBeCloseTo(0.6)
    timeline.totalTime(0, true)
    expect(Number(gsap.getProperty(board.children[0]!, 'opacity'))).toBeCloseTo(0.6)
    expect(Number(gsap.getProperty(board.children[1]!, 'opacity'))).toBe(0)
  } finally { output.__engagrTimeline?.kill() }
})
