// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { ref } from 'vue'
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
