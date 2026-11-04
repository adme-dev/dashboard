// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { readBannerPreviewPlayback, withBannerPreviewPlayback } from '~/utils/banner-preview-playback'

describe('preview animation clock reporting', () => {
  it('reads the real timeline through loops and completion without replacing animation callbacks', () => {
    const clock = { current: 2.7, duration: 12, iteration: 1, repeat: -1, paused: false, progress: 0.2 }
    const tl = { time: () => clock.current, duration: () => clock.duration, iteration: () => clock.iteration, repeat: () => clock.repeat, paused: () => clock.paused, totalProgress: () => clock.progress }
    const postMessage = vi.fn(), schedule = vi.fn(), clear = vi.fn(), events = vi.fn()
    const fakeWindow = { parent: { postMessage }, __engagrTimeline: tl, addEventListener: events }
    const script = new DOMParser().parseFromString(withBannerPreviewPlayback('<body></body>', 7), 'text/html').querySelector('script')!.textContent!
    new Function('window', 'setInterval', 'clearInterval', script)(fakeWindow, schedule, clear)
    expect(postMessage.mock.lastCall?.[0]).toMatchObject({ frameId: 7, current: 2.7, duration: 12, state: 'playing' })
    const tick = schedule.mock.calls[0]![0]
    clock.current = 0.1
    clock.iteration = 2
    tick()
    expect(postMessage.mock.lastCall?.[0]).toMatchObject({ current: 0.1, iteration: 2, state: 'playing' })
    clock.paused = true
    tick()
    expect(postMessage.mock.lastCall?.[0].state).toBe('paused')
    clock.paused = false
    clock.repeat = 1
    clock.current = 12
    clock.progress = 1
    tick()
    expect(postMessage.mock.lastCall?.[0]).toMatchObject({ current: 12, state: 'ended' })
    events.mock.calls.find(call => call[0] === 'pagehide')![1]()
    expect(clear).toHaveBeenCalled()
  })

  it('rejects stale frames, non-finite clocks and invalid ranges', () => {
    const message = { type: 'banner-preview-playback', frameId: 4, state: 'playing', current: 2, duration: 12, iteration: 1, repeat: -1 }
    expect(readBannerPreviewPlayback(message, 4)?.current).toBe(2)
    expect(readBannerPreviewPlayback(message, 5)).toBeNull()
    for (const invalid of [{ current: Infinity }, { current: 13 }, { duration: -1 }, { repeat: -2 }, { iteration: 0 }, { state: 'invented' }]) {
      expect(readBannerPreviewPlayback({ ...message, ...invalid }, 4)).toBeNull()
    }
  })
})
