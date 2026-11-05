// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableCSSFileLoading":true,"enableJavaScriptEvaluation":false}}
import { afterEach, expect, it, vi } from 'vitest'
import gsap from 'gsap'
import { buildBannerHTML } from '~/utils/banner-html-builder'
import { withBannerPreviewPlayback } from '~/utils/banner-preview-playback'
import type { Layer } from '~/types/banner-studio'

let timeline: gsap.core.Timeline | undefined
afterEach(() => {
  timeline?.kill()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

it('seeks actual scenes and timed audio both ways, holds the loop endpoint, and resumes without rebuilding', () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  const layers = [
    { id: 1, type: 'text', text: 'Scene', x: 0, y: 0, w: 100, h: 50, opacity: 1, startTime: 0, endTime: 8, animIn: 'none', animOut: 'none', keyframes: { x: [{ time: 0, value: 0 }, { time: 8, value: 80 }] } },
    { id: 2, type: 'audio', src: 'https://example.test/track.wav', startTime: 2, endTime: 8, volume: 0.5, loopAudio: true }
  ] as Layer[]
  const html = withBannerPreviewPlayback(buildBannerHTML('mrec', layers, { pausedAt: 0, playback: { duration: 8, loopCount: 0 } }), 7)
  document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML
  const audio = document.querySelector('audio')!
  Object.defineProperty(audio, 'duration', { value: 2 })
  const events = new Map<string, (e: { source: unknown, data: Record<string, unknown> }) => void>()
  const parent = { postMessage: vi.fn() }
  const runtime: { parent: typeof parent, addEventListener: (name: string, fn: (e: { source: unknown, data: Record<string, unknown> }) => void) => void, __engagrTimeline?: gsap.core.Timeline } = { parent, addEventListener: (name, fn) => events.set(name, fn) }
  for (const script of document.querySelectorAll('script:not([src]):not([type])')) {
    new Function('window', 'document', 'gsap', 'setInterval', script.textContent!)(runtime, document, gsap, vi.fn())
  }
  timeline = runtime.__engagrTimeline
  let commandId = 0
  const command = (action: string, time?: number, source: unknown = parent, frameId = 7) => events.get('message')!({ source, data: { type: 'banner-preview-control', frameId, commandId: ++commandId, action, time } })
  command('seek', 5.5)
  expect(timeline!.time()).toBe(5.5)
  expect(timeline!.paused()).toBe(true)
  expect(audio.currentTime).toBeCloseTo(1.5)
  expect(Number(gsap.getProperty('[data-id="1"]', 'x'))).toBeGreaterThan(0)
  expect(play).not.toHaveBeenCalled()
  command('play')
  expect(timeline!.paused()).toBe(false)
  expect(timeline!.time()).toBe(5.5)
  timeline!.totalTime(5.6, false)
  expect(play).toHaveBeenCalled()
  command('seek', 0)
  expect(audio.currentTime).toBe(0)
  expect(Number(gsap.getProperty('[data-id="1"]', 'x'))).toBe(0)
  command('seek', 8)
  expect(timeline!.time()).toBe(8)
  expect(Number(gsap.getProperty('[data-id="1"]', 'x'))).toBe(80)
  command('seek', 3, {}, 7)
  command('seek', 3, parent, 8)
  command('seek', Infinity)
  command('seek', -1)
  command('seek', 9)
  expect(timeline!.time()).toBe(8)
  command('play')
  expect(timeline!.time()).toBe(0)
  expect(timeline!.paused()).toBe(false)
  command('pause')
  expect(timeline!.paused()).toBe(true)
  command('seek', 4)
  command('replay')
  expect(timeline!.time()).toBe(0)
  expect(parent.postMessage.mock.lastCall?.[0]).toMatchObject({ state: 'playing', commandId, current: 0 })
})
