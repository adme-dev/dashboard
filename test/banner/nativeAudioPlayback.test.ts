import { describe, expect, it, vi } from 'vitest'
import { bannerAudioSyncScript } from '~~/shared/bannerAudioClock'
import { buildBannerHTML } from '~/utils/banner-html-builder'
import { buildBannerHTML as serverBuilder } from '~~/server/utils/banner/htmlBuilder'
import type { Layer } from '~/types/banner-studio'

const settle = () => new Promise(resolve => setTimeout(resolve, 0))

function runtime(clock = {}) {
  let time = 0, paused = true
  const seeks = vi.fn()
  const events = new Map<string, () => void>()
  let resolvePlay: () => void = () => {}
  const media = {
    get currentTime() { return time },
    set currentTime(value: number) {
      time = value
      seeks(value)
    },
    addEventListener: (name: string, handler: () => void) => events.set(name, handler),
    duration: 15, paused: true, playbackRate: 1, volume: 1, loop: false,
    play: vi.fn(() => new Promise<void>((resolve) => { resolvePlay = resolve })),
    pause: vi.fn(() => { media.paused = true })
  }
  let tick: () => void, proxy: { t: number }
  const tl = { paused: () => paused, timeScale: () => 1, to: (p: { t: number }, options: { onUpdate: () => void }) => {
    proxy = p
    tick = options.onUpdate
  } }
  new Function('document', 'tl', bannerAudioSyncScript({ id: 2, endTime: 15, ...clock }))({ querySelector: () => media }, tl)
  return { media, seeks, seeked: () => events.get('seeked')!(), loaded: () => events.get('loadedmetadata')!(), update(t: number, playing: boolean) {
    paused = !playing
    proxy.t = t
    tick()
  }, started() {
    media.paused = false
    resolvePlay()
  } }
}

describe('continuous shared-preview audio', () => {
  it('does not seek or resubmit play while Safari is starting its decoder', async () => {
    const r = runtime()
    for (let frame = 1; frame <= 120; frame++) r.update(frame / 60, true)
    expect(r.media.play).toHaveBeenCalledTimes(1)
    expect(r.seeks).not.toHaveBeenCalled()
    r.started()
    await Promise.resolve()
    // A delayed audio clock must not be repeatedly jumped to the visual clock.
    r.media.currentTime = 0.2
    r.seeks.mockClear()
    for (let frame = 121; frame <= 240; frame++) r.update(frame / 60, true)
    expect(r.seeks).not.toHaveBeenCalled()
    expect(r.media.paused).toBe(false)
  })

  it('preserves silent seeks, replay boundaries, native track loops and hidden volume', async () => {
    const r = runtime({ loopAudio: true, hidden: true })
    expect(r.media.volume).toBe(0)
    expect(r.media.loop).toBe(true)
    r.update(4.75, false)
    expect(r.media.currentTime).toBe(4.75)
    expect(r.media.play).not.toHaveBeenCalled()
    r.update(4.8, true)
    expect(r.media.play).not.toHaveBeenCalled()
    r.seeked()
    r.started()
    await settle()
    r.update(0.02, true)
    expect(r.media.currentTime).toBe(0.02)
    r.update(6, false)
    r.seeked()
    expect(r.media.currentTime).toBe(6)
    expect(r.media.paused).toBe(true)
  })

  it('serializes seeks, retains the latest target, and waits for play to settle before another seek', async () => {
    const r = runtime()
    r.update(1, false)
    r.update(2, false)
    r.update(3, false)
    r.update(3.1, true)
    expect(r.seeks.mock.calls.map(call => call[0])).toEqual([1])
    expect(r.media.play).not.toHaveBeenCalled()
    r.seeked()
    expect(r.seeks.mock.calls.map(call => call[0])).toEqual([1, 3])
    expect(r.media.play).not.toHaveBeenCalled()
    r.seeked()
    expect(r.media.play).toHaveBeenCalledTimes(1)
    r.update(4, false)
    expect(r.seeks).toHaveBeenCalledTimes(2)
    r.started()
    await settle()
    expect(r.seeks.mock.calls.map(call => call[0])).toEqual([1, 3, 4])
    expect(r.media.paused).toBe(true)
    r.seeked()
    expect(r.media.play).toHaveBeenCalledTimes(1)
  })

  it('defers the latest seek until metadata is available', () => {
    const r = runtime()
    r.media.duration = NaN
    r.update(2, false)
    r.update(3, false)
    r.update(3.1, true)
    expect(r.seeks).not.toHaveBeenCalled()
    expect(r.media.play).not.toHaveBeenCalled()
    r.media.duration = 15
    r.loaded()
    expect(r.media.currentTime).toBe(3)
    expect(r.media.play).not.toHaveBeenCalled()
    r.seeked()
    expect(r.media.play).toHaveBeenCalledOnce()
  })

  it('keeps both HTML builders aligned', () => {
    const layers = [{ id: 2, type: 'audio', src: 'https://example.test/track.mp3', startTime: 0, endTime: 15, volume: 1 }] as Layer[]
    const html = buildBannerHTML('mrec', layers, { pausedAt: 0 })
    expect(serverBuilder('mrec', layers, { pausedAt: 0 })).toBe(html)
    expect(html).not.toContain('Math.abs(a.currentTime - mt) > 0.3')
  })
})
