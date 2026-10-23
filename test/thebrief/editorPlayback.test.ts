// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import gsap from 'gsap'
import { useBannerTimeline } from '../../app/composables/useBannerTimeline'
import type { BannerPlayback, Layer } from '../../app/types/banner-studio'

const layers = [{ id: 1, type: 'rect', opacity: 1, x: 0, y: 0, w: 10, h: 10, startTime: 0, endTime: 1, keyframes: { opacity: [{ time: 0, value: 1 }, { time: 1, value: 0.4 }] } }] as Layer[]
afterEach(() => vi.unstubAllGlobals())

it.each([0, 1, 3])('editor preserves source duration and %i plays despite legacy loop toggle', (loopCount) => {
  const playback: BannerPlayback = { duration: 4, loopCount }
  const state = { sets: { imported: { layers, playback } }, activeKey: 'imported', isLooping: true, isPlaying: true, currentTime: 0, duration: 5, soloMotionPath: false, selectedLayerId: null }
  vi.stubGlobal('useBannerStudio', () => ({ state, activeLayers: ref(layers) }))
  const artboard = document.createElement('div')
  artboard.innerHTML = '<div id="lyr-1"></div>'
  document.body.append(artboard)
  const studio = useBannerTimeline()
  const timeline = studio.buildTimeline(artboard, layers)
  expect(state.duration).toBe(4)
  expect(timeline.repeat()).toBe(loopCount === 0 ? -1 : loopCount - 1)
  const end = loopCount ? loopCount * 4 : 11.9
  for (let tick = 1; tick <= Math.round(end * 10); tick++) timeline.totalTime(tick / 10, false)
  expect(Number((artboard.firstElementChild as HTMLElement).style.opacity)).toBeCloseTo(0.4)
  expect(state.isPlaying).toBe(loopCount === 0)
  if (loopCount) expect(state.currentTime).toBe(4)
  const standalone = studio.buildTimelineForKey(artboard, layers, playback)
  expect(standalone.repeat()).toBe(loopCount === 0 ? -1 : loopCount - 1)
  expect(standalone.duration()).toBe(4)
  standalone.kill()
  timeline.kill()
  artboard.remove()
})

it.each(['keyframes', 'fadeIn', 'slideL', 'spinIn'] as const)('preserves static rotation after %s playback, stop and rebuild', (animation) => {
  const layer: Layer = {
    id: 1, name: 'Vertical divider', type: 'rect', x: 0, y: 0, w: 85, h: 3,
    zIndex: 1, opacity: 1, rotation: 90, transformOrigin: { x: 42.5, y: 1.5 },
    animIn: animation === 'keyframes' ? 'none' : animation, animInDur: 1,
    animOut: 'none', startTime: 0, endTime: 4,
    ...(animation === 'keyframes'
      ? { keyframes: {
          y: [{ time: 0, value: -50 }, { time: 1, value: 0 }],
          opacity: [{ time: 0, value: 0 }, { time: 1, value: 1 }, { time: 4, value: 1 }]
        } }
      : {})
  }
  const state = { sets: { imported: { layers: [layer], playback: { duration: 4, loopCount: 1 } } }, activeKey: 'imported', isLooping: false, isPlaying: false, currentTime: 0, duration: 4 }
  vi.stubGlobal('useBannerStudio', () => ({ state, activeLayers: ref([layer]) }))
  const artboard = document.createElement('div')
  const element = document.createElement('div')
  element.id = 'lyr-1'
  element.style.transform = 'rotate(90deg)'
  element.style.transformOrigin = '42.5px 1.5px'
  artboard.append(element)
  document.body.append(artboard)
  const studio = useBannerTimeline()
  const timeline = studio.buildTimeline(artboard, [layer])
  const expectRestingTransform = () => {
    expect(Number(gsap.getProperty(element, 'rotation'))).toBeCloseTo(90)
    expect(Number(gsap.getProperty(element, 'x'))).toBeCloseTo(0)
    expect(Number(gsap.getProperty(element, 'y'))).toBeCloseTo(0)
    expect(Number(gsap.getProperty(element, 'scaleX'))).toBeCloseTo(1)
    expect(element.style.transformOrigin).toBe('42.5px 1.5px')
    expect(element.style.transform).toContain('rotate(90deg)')
  }
  try {
    expectRestingTransform()
    timeline.totalTime(1.5, false)
    expectRestingTransform()
    studio.stopTimeline()
    expectRestingTransform()
    const rebuilt = studio.buildTimeline(artboard, [layer])
    expectRestingTransform()
    rebuilt.totalTime(1.5, false)
    expectRestingTransform()
    // Rotation edits must replace the old GSAP cache when rebuilding.
    layer.rotation = 45
    const edited = studio.buildTimeline(artboard, [layer])
    expect(Number(gsap.getProperty(element, 'rotation'))).toBeCloseTo(45)
    studio.stopTimeline()
    expect(Number(gsap.getProperty(element, 'rotation'))).toBeCloseTo(45)
    edited.kill()
    // Legacy non-looping playback also returns to the rotated editing state.
    delete state.sets.imported.playback
    const legacy = studio.buildTimeline(artboard, [layer])
    for (let tick = 1; tick <= 40; tick++) legacy.totalTime(tick / 10, false)
    expect(Number(gsap.getProperty(element, 'rotation'))).toBeCloseTo(45)
    expect(element.style.transform).toContain('rotate(45deg)')
    legacy.kill()
  } finally {
    studio.stopTimeline()
    timeline.kill()
    artboard.remove()
  }
})

it('hard cuts imported scenes when seeking forward, backward and across loops', () => {
  const scenes = [0, 1].map(index => ({ id: index + 1, type: 'rect', opacity: 1, x: 0, y: 0, w: 10, h: 10, startTime: index * 2, endTime: index * 2 + 2, clipToPresence: true, keyframes: { opacity: [{ time: index * 2, value: 1 }, { time: index * 2 + 2, value: 1 }] } })) as Layer[]
  const playback = { duration: 4, loopCount: 0 }
  const state = { sets: { imported: { layers: scenes, playback } }, activeKey: 'imported', isLooping: true, isPlaying: false, currentTime: 0, duration: 4 }
  vi.stubGlobal('useBannerStudio', () => ({ state, activeLayers: ref(scenes) }))
  const artboard = document.createElement('div')
  artboard.innerHTML = '<div id="lyr-1"></div><div id="lyr-2"></div>'
  document.body.append(artboard)
  const studio = useBannerTimeline()
  const timeline = studio.buildTimeline(artboard, scenes)
  try {
    for (const [time, expected] of [[0.1, ['visible', 'hidden']], [2.1, ['hidden', 'visible']], [0.5, ['visible', 'hidden']], [6.1, ['hidden', 'visible']], [4.1, ['visible', 'hidden']]] as const) {
      timeline.totalTime(time, false)
      expect([...artboard.children].map(el => (el as HTMLElement).style.visibility)).toEqual(expected)
    }
  } finally {
    timeline.kill()
    artboard.remove()
  }
})

it('exports scene cuts that seek backwards and hold the last scene at the capture boundary', async () => {
  const { buildBannerHTML } = await import('../../app/utils/banner-html-builder')
  const { buildBannerHTML: serverBuilder } = await import('../../server/utils/banner/htmlBuilder')
  const scenes = [0, 1].map(index => ({ id: index + 1, type: 'rect', opacity: 1, x: 0, y: 0, w: 10, h: 10, startTime: index * 2, endTime: index * 2 + 2, clipToPresence: true, keyframes: { opacity: [{ time: index * 2, value: 1, easing: 'linear' }, { time: index * 2 + 2, value: 1 }] } })) as Layer[]
  const options = { playback: { duration: 4, loopCount: 1 } }
  const html = buildBannerHTML('mrec', scenes, options)
  expect(serverBuilder('mrec', scenes, options)).toBe(html)
  const artboard = document.createElement('div')
  artboard.innerHTML = '<div data-id="1"></div><div data-id="2"></div>'
  document.body.append(artboard)
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(code => code.includes('const tl ='))!
  const output = {} as { __engagrTimeline: gsap.core.Timeline }
  try {
    new Function('gsap', 'window', script)(gsap, output)
    const timeline = output.__engagrTimeline.pause()
    for (const [time, expected] of [[0.1, ['visible', 'hidden']], [2, ['hidden', 'visible']], [0, ['visible', 'hidden']], [4, ['hidden', 'visible']]] as const) {
      timeline.totalTime(time, false)
      expect([...artboard.children].map(el => (el as HTMLElement).style.visibility)).toEqual(expected)
    }
  } finally {
    output.__engagrTimeline?.kill()
    artboard.remove()
  }
})
