// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { createBannerPreviewAudioController } from '~/utils/banner-preview-audio'
import { buildBannerHTML } from '~/utils/banner-html-builder'
import type { Layer } from '~/types/banner-studio'

function track(startTime = 0, endTime = 15) {
  let currentTime = 0
  let paused = true
  let seeks = 0
  const media = {
    volume: 1,
    muted: false,
    get currentTime() { return currentTime },
    set currentTime(value: number) {
      currentTime = value
      seeks++
    },
    get paused() { return paused },
    play: vi.fn(() => {
      paused = false
      return Promise.resolve()
    }),
    pause: vi.fn(() => { paused = true })
  } as unknown as HTMLAudioElement
  const layer = { id: 1, type: 'audio', src: '/sound.mp3', startTime, endTime, volume: 0.6 } as Layer
  return { media, layer, seeks: () => seeks }
}

describe('saved preview host audio', () => {
  it('keeps audio-only timeline length without loading a second decoder in the iframe', () => {
    const { layer } = track(2, 15)
    const html = buildBannerHTML('mrec', [layer], { pausedAt: 0, externalAudio: true })
    expect(html).not.toContain('<audio')
    expect(html).toContain('tl.to({}, { duration: 15 }, 0)')
    expect(buildBannerHTML('mrec', [layer], { pausedAt: 0 })).toContain('<audio')
  })

  it('starts directly from Play and does not interrupt Safari decoding on clock reports', () => {
    const entry = track()
    const error = vi.fn()
    const controller = createBannerPreviewAudioController(() => [entry], error)
    controller.start(0, 1)
    expect(entry.media.play).toHaveBeenCalledTimes(1)
    for (let time = 0.1; time < 3; time += 0.1) controller.sync(time, 1)
    expect(entry.seeks()).toBe(0)
    expect(entry.media.play).toHaveBeenCalledTimes(1)
    expect(error).not.toHaveBeenCalled()
  })

  it('positions only for an explicit scrub or loop and respects the mute control', () => {
    const entry = track(1, 5)
    const controller = createBannerPreviewAudioController(() => [entry], vi.fn())
    controller.start(0, 1)
    expect(entry.media.play).not.toHaveBeenCalled()
    controller.sync(1.1, 1)
    expect(entry.media.play).toHaveBeenCalledTimes(1)
    expect(entry.media.volume).toBe(0.6)
    controller.sync(2.2, 1)
    expect(entry.seeks()).toBe(1)
    controller.setMuted(true)
    expect(entry.media.muted).toBe(true)
    controller.setMuted(false)
    expect(entry.media.muted).toBe(false)
    controller.seek(3.5)
    expect(entry.media.currentTime).toBe(2.5)
    controller.start(3.5, 1)
    controller.sync(0.2, 2)
    expect(entry.media.paused).toBe(true)
    expect(entry.media.currentTime).toBe(0)
  })

  it('reapplies a scrub when Safari ignores currentTime before metadata', () => {
    const entry = track()
    Object.defineProperty(entry.media, 'readyState', { value: 0, writable: true })
    const controller = createBannerPreviewAudioController(() => [entry], vi.fn())
    controller.seek(4)
    entry.media.currentTime = 0
    Object.defineProperty(entry.media, 'readyState', { value: 1 })
    controller.loaded(entry.media)
    expect(entry.media.currentTime).toBe(4)
  })

  it('reports Safari playback denial and retries on the next user tap', async () => {
    const entry = track()
    vi.mocked(entry.media.play).mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'))
    const error = vi.fn()
    const controller = createBannerPreviewAudioController(() => [entry], error)
    controller.start(0, 1)
    await Promise.resolve()
    await Promise.resolve()
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Safari blocked sound'))
    controller.start(0, 1)
    expect(entry.media.play).toHaveBeenCalledTimes(2)
  })
})
