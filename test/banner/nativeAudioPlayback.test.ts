import { describe, expect, it, vi } from 'vitest'
import { bannerAudioSyncScript } from '~~/shared/bannerAudioClock'
import { buildBannerHTML } from '~/utils/banner-html-builder'
import { buildBannerHTML as serverBuilder } from '~~/server/utils/banner/htmlBuilder'
import type { Layer } from '~/types/banner-studio'

function runtime(clock = {}) {
  let time = 0, paused = true
  const seeks = vi.fn()
  let resolvePlay: () => void = () => {}
  const media = {
    get currentTime() { return time },
    set currentTime(value: number) {
      time = value
      seeks(value)
    },
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
  return { media, seeks, update(t: number, playing: boolean) {
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

  it('preserves silent seeks, replay boundaries, native track loops and hidden volume', () => {
    const r = runtime({ loopAudio: true, hidden: true })
    expect(r.media.volume).toBe(0)
    expect(r.media.loop).toBe(true)
    r.update(4.75, false)
    expect(r.media.currentTime).toBe(4.75)
    expect(r.media.play).not.toHaveBeenCalled()
    r.update(4.8, true)
    r.started()
    r.update(0.02, true)
    expect(r.media.currentTime).toBe(0.02)
    r.update(6, false)
    expect(r.media.currentTime).toBe(6)
    expect(r.media.paused).toBe(true)
  })

  it('keeps both HTML builders aligned', () => {
    const layers = [{ id: 2, type: 'audio', src: 'https://example.test/track.mp3', startTime: 0, endTime: 15, volume: 1 }] as Layer[]
    const html = buildBannerHTML('mrec', layers, { pausedAt: 0 })
    expect(serverBuilder('mrec', layers, { pausedAt: 0 })).toBe(html)
    expect(html).not.toContain('Math.abs(a.currentTime - mt) > 0.3')
  })
})
