import { describe, expect, it, vi } from 'vitest'
import { bannerVideoSyncScript } from '~~/shared/bannerVideoClock'
import { buildBannerHTML } from '~/utils/banner-html-builder'
import { buildBannerHTML as serverBuilder } from '~~/server/utils/banner/htmlBuilder'
import type { Layer } from '~/types/banner-studio'

function runtime(clock = {}) {
  let time = 0, paused = true
  const seeks = vi.fn()
  const video = {
    get currentTime() { return time },
    set currentTime(value: number) {
      time = value
      seeks(value)
    },
    duration: 10, paused: true, seeking: false, playbackRate: 1,
    play: vi.fn(() => {
      video.paused = false
      return Promise.resolve()
    }),
    pause: vi.fn(() => { video.paused = true })
  }
  let tick: () => void, complete: () => void, proxy: { t: number }
  const tl = { paused: () => paused, timeScale: () => 1, to: (p: { t: number }, options: { onUpdate: () => void, onComplete: () => void }) => {
    proxy = p
    tick = options.onUpdate
    complete = options.onComplete
  } }
  new Function('document', 'tl', bannerVideoSyncScript({ id: 3, endTime: 10, ...clock }))({ querySelector: () => video }, tl)
  return { video, seeks, update(t: number, playing: boolean, nativeTime?: number) {
    paused = !playing
    if (nativeTime !== undefined) time = nativeTime
    proxy.t = t
    tick()
  }, complete: () => complete() }
}

describe('native video playback', () => {
  it('lets the decoder advance through continuous playback without frame-by-frame seeks', async () => {
    const r = runtime()
    for (let frame = 1; frame <= 120; frame++) r.update(frame / 60, true, frame / 60 - 0.02)
    expect(r.seeks).not.toHaveBeenCalled()
    expect(r.video.play).toHaveBeenCalledTimes(1)
    expect(r.video.paused).toBe(false)
    await Promise.resolve()
    r.complete()
    expect(r.video.paused).toBe(true)
  })

  it('keeps scrubbing and export seeks precise, then resumes native playback', () => {
    const r = runtime({ mediaStart: 2, mediaEnd: 8 })
    r.update(2.125, false)
    expect(r.video.currentTime).toBe(4.125)
    expect(r.video.play).not.toHaveBeenCalled()
    r.update(2.14, true)
    expect(r.video.play).toHaveBeenCalledOnce()
    expect(r.seeks).toHaveBeenCalledTimes(1)
    r.update(8, true)
    expect(r.video.currentTime).toBe(8)
    expect(r.video.paused).toBe(true)
  })

  it('corrects drift and short trimmed loops without interrupting an in-flight seek', () => {
    const r = runtime({ mediaStart: 2, mediaEnd: 2.3, mediaLoop: true })
    r.update(0.29, true, 2.29)
    r.update(0.31, true, 2.31)
    expect(r.video.currentTime).toBeCloseTo(2.01)
    r.video.seeking = true
    r.update(0.8, true, 5)
    expect(r.video.currentTime).toBe(5)
    r.video.seeking = false
    r.update(0.81, true)
    expect(r.video.currentTime).toBeCloseTo(2.21)
  })

  it.each([{}, { keyframes: { opacity: [{ time: 0, value: 1 }, { time: 10, value: 1 }] } }])('keeps both builders and both animation paths aligned', (extra) => {
    const layers = [{ id: 3, type: 'video', src: 'https://example.test/video.mp4', x: 0, y: 0, w: 300, h: 250, opacity: 1, startTime: 0, endTime: 10, ...extra }] as Layer[]
    const html = buildBannerHTML('mrec', layers, { pausedAt: 0 })
    expect(serverBuilder('mrec', layers, { pausedAt: 0 })).toBe(html)
    expect(html.match(/Repeated currentTime writes/g)).toHaveLength(1)
  })
})
