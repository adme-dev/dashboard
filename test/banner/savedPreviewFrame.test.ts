// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableCSSFileLoading":true,"enableJavaScriptEvaluation":false}}
import { afterEach, describe, expect, it, vi } from 'vitest'
import gsap from 'gsap'
import { buildBannerHTML } from '~/utils/banner-html-builder'
import { buildBannerHTML as serverBuilder } from '~~/server/utils/banner/htmlBuilder'
import type { Layer } from '~/types/banner-studio'

const layer = (id: number, extra: Partial<Layer> = {}): Layer => ({
  id, name: `Scene ${id}`, type: 'text', text: `Scene ${id}`, x: 0, y: 0, w: 100, h: 40,
  opacity: 1, zIndex: id, startTime: 0, endTime: 4, animIn: 'none', animOut: 'none',
  ...extra
} as Layer)
const scenes = [
  layer(1, { keyframes: { opacity: [{ time: 0, value: 1 }, { time: 1.9, value: 1 }, { time: 2, value: 0 }, { time: 4, value: 0 }] } }),
  layer(2, { keyframes: { opacity: [{ time: 0, value: 0 }, { time: 2, value: 0 }, { time: 2.1, value: 1 }, { time: 4, value: 1 }], x: [{ time: 0, value: 80 }, { time: 4, value: 0 }] } }),
  layer(3, { startTime: 2, clipToPresence: true }),
  layer(4, { type: 'audio', src: 'https://example.test/audio.mp3' })
]
const runtimeWindow: { __engagrTimeline?: gsap.core.Timeline, __engagrFrame?: { seek: (t: number) => void } } = {}
function load(html: string, animationEngine: unknown = gsap) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  document.body.innerHTML = parsed.body.innerHTML
  for (const script of document.querySelectorAll('script:not([src]):not([type])')) {
    try {
      new Function('window', 'document', 'gsap', script.textContent!)(runtimeWindow, document, animationEngine)
    } catch { /* browser continues with the next script */ }
  }
}
afterEach(() => {
  runtimeWindow.__engagrTimeline?.kill()
  delete runtimeWindow.__engagrTimeline
  delete runtimeWindow.__engagrFrame
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('saved banner timeline frames', () => {
  it('shows only the opening scene, holds the first keyframe position and never starts sound', () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const html = buildBannerHTML('custom_1200x1200', scenes, { pausedAt: 0 })
    expect(serverBuilder('custom_1200x1200', scenes, { pausedAt: 0 })).toBe(html)
    load(html)
    expect(runtimeWindow.__engagrTimeline?.paused()).toBe(true)
    expect(Number(gsap.getProperty('[data-id="1"]', 'opacity'))).toBe(1)
    expect(Number(gsap.getProperty('[data-id="2"]', 'opacity'))).toBe(0)
    expect(Number(gsap.getProperty('[data-id="2"]', 'x'))).toBe(80)
    expect(document.querySelector<HTMLElement>('[data-id="3"]')?.style.visibility).toBe('hidden')
    expect(play).not.toHaveBeenCalled()
    runtimeWindow.__engagrFrame!.seek(3)
    expect(Number(gsap.getProperty('[data-id="1"]', 'opacity'))).toBe(0)
    expect(Number(gsap.getProperty('[data-id="2"]', 'opacity'))).toBe(1)
    runtimeWindow.__engagrFrame!.seek(0)
    expect(Number(gsap.getProperty('[data-id="1"]', 'opacity'))).toBe(1)
    expect(Number(gsap.getProperty('[data-id="2"]', 'opacity'))).toBe(0)
    expect(play).not.toHaveBeenCalled()
  })

  it('can show an empty saved artboard without treating it as a missing engine', () => {
    load(buildBannerHTML('mrec', [], { pausedAt: 0 }))
    expect(document.querySelector('.ad')?.textContent).not.toContain('Preview unavailable')
    expect(runtimeWindow.__engagrTimeline?.paused()).toBe(true)
  })

  it('keeps delayed looping sound on its media clock and respects hidden track volume', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    load(buildBannerHTML('mrec', [layer(8, { type: 'audio', src: 'https://example.test/loop.wav', startTime: 2, endTime: 8, loopAudio: true, hidden: true, volume: 0.8 })], { pausedAt: 0 }))
    const audio = document.querySelector('audio')!
    Object.defineProperty(audio, 'duration', { value: 2 })
    expect(audio.volume).toBe(0)
    runtimeWindow.__engagrFrame!.seek(5.5)
    expect(audio.currentTime).toBeCloseTo(1.5)
    expect(audio.paused).toBe(true)
    runtimeWindow.__engagrFrame!.seek(0)
    expect(audio.currentTime).toBe(0)
  })

  it('retains ordinary animated export playback', () => {
    load(buildBannerHTML('mrec', [layer(1)]))
    expect(runtimeWindow.__engagrTimeline?.paused()).toBe(false)
  })

  it('replaces the uncomposited stack with an error when the animation engine cannot load', () => {
    load(buildBannerHTML('mrec', scenes, { pausedAt: 0 }), null)
    expect(document.querySelector('.ad')?.textContent).toBe('Preview unavailable. Reload to try again.')
    expect(document.querySelectorAll('.layer')).toHaveLength(0)
  })

  it.each([-1, NaN, Infinity])('rejects an invalid paused time %s', (pausedAt) => {
    expect(() => buildBannerHTML('mrec', scenes, { pausedAt })).toThrow()
  })
})
