// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useBannerTimeline } from '../../app/composables/useBannerTimeline'
import { editSlides, slidePoster } from '../../app/utils/banner-slides'
import { buildBannerHTML as client } from '../../app/utils/banner-html-builder'
import { buildBannerHTML as server } from '../../server/utils/banner/htmlBuilder'
import type { ArtboardState, Layer } from '../../app/types/banner-studio'
import gsap from 'gsap'

const initial = (): ArtboardState => ({ playback: { duration: 4, loopCount: 1 }, layers: [0, 1].map(index => ({ id: index + 1, type: 'rect', opacity: 1, name: `Scene ${index}`, x: 0, y: 0, w: 300, h: 250, zIndex: 1, fillColor: index ? '#ff0000' : '#0000ff', startTime: index * 2, endTime: index * 2 + 2, clipToPresence: true, animIn: 'none', animInDur: 0, animOut: 'none', keyframes: { opacity: [{ time: index * 2, value: 1 }, { time: index * 2 + 2, value: 1 }] } } as Layer)) })
afterEach(() => vi.unstubAllGlobals())
it.each([0, 1, 3])('renders a slide fade and hard cuts forwards, backwards and through %i plays', (loopCount) => {
  let id = 2
  const board = editSlides(initial(), { type: 'transition', index: 0, duration: 1 }, () => ++id, { w: 300, h: 250 })
  board.playback!.loopCount = loopCount
  const state = { activeKey: 'mrec', sets: { mrec: board }, currentTime: 0, duration: 4, isPlaying: false }
  vi.stubGlobal('useBannerStudio', () => ({ state, activeLayers: ref(board.layers) }))
  const root = document.createElement('div')
  for (const layer of board.layers) {
    const element = document.createElement('div')
    element.id = `lyr-${layer.id}`
    root.append(element)
  }
  document.body.append(root)
  const controller = useBannerTimeline()
  const timeline = controller.buildTimeline(root, board.layers)
  const overlay = root.querySelector<HTMLElement>('#lyr-3')!
  try {
    for (const [time, opacity] of [[1.5, 0], [1.75, 0.5], [2, 1], [2.25, 0.5], [2.5, 0], [0.5, 0], [2, 1]]) {
      controller.seekTo(time!)
      expect(Number(gsap.getProperty(overlay, 'opacity'))).toBeCloseTo(opacity!)
      expect(root.querySelector<HTMLElement>('#lyr-1')!.style.visibility).toBe(time! >= 2 ? 'hidden' : 'visible')
      expect(root.querySelector<HTMLElement>('#lyr-2')!.style.visibility).toBe(time! >= 2 ? 'visible' : 'hidden')
    }
    expect(timeline.duration()).toBe(4)
    expect(timeline.repeat()).toBe(loopCount === 0 ? -1 : loopCount - 1)
    const html = client('mrec', board.layers, { playback: board.playback })
    expect(server('mrec', board.layers, { playback: board.playback })).toBe(html)
    expect(html).toContain('opacity: 1, duration: 0.500')
    expect(html).toContain('fixedCycleDuration = true')
    expect(html).toContain('visibility: \'hidden\'')
  } finally {
    controller.destroyTimeline()
    root.remove()
  }
})

it('clips native preset layers to their scenes equally in editor and both export builders', () => {
  const board = initial()
  for (const layer of board.layers) delete layer.keyframes
  const state = { activeKey: 'mrec', sets: { mrec: board }, currentTime: 0, duration: 4, isPlaying: false }
  vi.stubGlobal('useBannerStudio', () => ({ state, activeLayers: ref(board.layers) }))
  const root = document.createElement('div')
  root.innerHTML = '<div id="lyr-1"></div><div id="lyr-2"></div>'
  document.body.append(root)
  const controller = useBannerTimeline()
  try {
    controller.buildTimeline(root, board.layers)
    for (const time of [3, 1, 2, 0.5]) {
      controller.seekTo(time)
      expect(root.querySelector<HTMLElement>('#lyr-1')!.style.visibility).toBe(time >= 2 ? 'hidden' : 'visible')
      expect(root.querySelector<HTMLElement>('#lyr-2')!.style.visibility).toBe(time >= 2 ? 'visible' : 'hidden')
    }
    const html = client('mrec', board.layers, { playback: board.playback })
    expect(server('mrec', board.layers, { playback: board.playback })).toBe(html)
    expect(html).toContain('tl.set(\'[data-id="1"]\', { visibility: \'hidden\' }, 2)')
  } finally {
    controller.destroyTimeline()
    root.remove()
  }
})

it('exports transition overlays above artwork added later or brought to the front', () => {
  let id = 2
  const board = editSlides(initial(), { type: 'transition', index: 0, duration: 1 }, () => ++id, { w: 300, h: 250 })
  board.layers.push({ ...board.layers[0]!, id: 99, name: 'Later artwork', zIndex: 99999 })
  for (const build of [client, server]) {
    const html = build('mrec', board.layers, { playback: board.playback })
    expect(html.indexOf('class="layer" data-id="3"')).toBeGreaterThan(html.indexOf('class="layer" data-id="99"'))
  }
})

it('keeps an intentional seek into a newly added slide while rebuilding an older, shorter clock', () => {
  const board = initial()
  const state = { activeKey: 'mrec', sets: { mrec: board }, currentTime: 0, duration: 4, isPlaying: false }
  vi.stubGlobal('useBannerStudio', () => ({ state, activeLayers: ref(board.layers) }))
  const root = document.createElement('div')
  root.innerHTML = '<div id="lyr-1"></div><div id="lyr-2"></div>'
  document.body.append(root)
  const controller = useBannerTimeline()
  try {
    controller.buildTimeline(root, board.layers)
    state.sets.mrec = editSlides(board, { type: 'add', after: 1, id: 'new' }, () => 10, { w: 300, h: 250 })
    controller.seekTo(5)
    expect(state.currentTime).toBe(5)
    expect(controller.masterTl!.time()).toBe(4)
    controller.buildTimeline(root, state.sets.mrec.layers)
    expect(state.currentTime).toBe(5)
    expect(controller.masterTl!.time()).toBe(5)
    expect(state.duration).toBe(7)
  } finally {
    controller.destroyTimeline()
    root.remove()
  }
})

it('builds a static image poster for the chosen slide without other scenes or transition overlays', () => {
  let id = 2
  const board = editSlides(initial(), { type: 'transition', index: 0, duration: 1 }, () => ++id, { w: 300, h: 250 })
  Object.assign(board.layers[0]!, { type: 'text', text: 'First offer' })
  Object.assign(board.layers[1]!, { type: 'text', text: 'Second offer' })
  const poster = slidePoster(board, board.slides![1]!.id)
  for (const build of [client, server]) {
    const html = build('mrec', poster.layers, { includeAnimations: false })
    expect(html).toContain('Second offer')
    expect(html).not.toContain('First offer')
    expect(html).not.toContain('data-id="3"')
    expect(html).not.toContain('visibility:hidden')
  }
})
