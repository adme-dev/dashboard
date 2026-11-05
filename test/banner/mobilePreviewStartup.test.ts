import { afterEach, describe, expect, it, vi } from 'vitest'
import { withBannerPreviewPlayback } from '~/utils/banner-preview-playback'

const cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  vi.clearAllTimers()
  vi.useRealTimers()
})

function player(options: { ready?: number, gestureRequired?: boolean } = {}) {
  vi.useFakeTimers()
  let gesture = false, time = 0, paused = true
  const docEvents = new Map<string, (event?: unknown) => void>()
  const winEvents = new Map<string, (event?: unknown) => void>()
  const postMessage = vi.fn()
  const parent = { postMessage }
  const media = ['VIDEO', 'AUDIO'].map((tagName) => {
    const pending: Array<() => void> = []
    let unlocked = !options.gestureRequired || tagName === 'VIDEO'
    const el = {
      tagName, volume: 1, muted: false, readyState: options.ready ?? 0,
      paused: true, ended: false, seeking: false, currentTime: 0, error: null,
      getAttribute: () => '/asset', addEventListener: vi.fn(), removeEventListener: vi.fn(),
      pause: vi.fn(() => { el.paused = true }),
      play: vi.fn(() => {
        if (gesture) unlocked = true
        if (!unlocked) return Promise.reject(Object.assign(new Error(), { name: 'NotAllowedError' }))
        if (el.readyState >= 2) {
          el.paused = false
          return Promise.resolve()
        }
        return new Promise<void>(resolve => pending.push(() => {
          el.readyState = 4
          el.paused = false
          resolve()
        }))
      }),
      load: () => pending.splice(0).forEach(resolve => resolve())
    }
    return el
  })
  const timeline = {
    time: () => time, duration: () => 15, iteration: () => 1, repeat: () => 0,
    totalProgress: () => 0, paused: () => paused,
    pause: vi.fn(() => { paused = true }),
    totalTime: vi.fn((next: number) => {
      time = next
    }),
    render: vi.fn((next: number) => {
      time = next
      media.forEach((el) => {
        el.currentTime = next
      })
    }),
    play: vi.fn(() => {
      paused = false
      media.forEach((el) => {
        void el.play().catch(() => {})
      })
    })
  }
  const doc = {
    body: { tabIndex: -1 }, querySelectorAll: () => media,
    addEventListener: (name: string, fn: () => void) => docEvents.set(name, fn),
    removeEventListener: (name: string) => docEvents.delete(name)
  }
  const frame = {
    parent, __engagrTimeline: timeline, __engagrPreviewMuted: false,
    addEventListener: (name: string, fn: () => void) => winEvents.set(name, fn)
  }
  const source = withBannerPreviewPlayback('<body></body>', 3).match(/<script>([\s\S]*)<\/script>/)![1]!
  new Function('window', 'document', 'setInterval', 'clearInterval', source)(frame, doc, vi.fn(), vi.fn())
  cleanups.push(() => winEvents.get('pagehide')?.())
  let commandId = 0
  return {
    timeline, media, state: () => postMessage.mock.lastCall?.[0],
    command: (action: string) => winEvents.get('message')!({ source: parent, data: { type: 'banner-preview-control', frameId: 3, commandId: ++commandId, action } }),
    tap: () => {
      gesture = true
      docEvents.get('click')!()
      gesture = false
    }
  }
}

describe('mobile first-tap startup', () => {
  it('accepts Play without preload and keeps the timeline stopped until both media requests finish', async () => {
    const p = player()
    expect(p.state()).toMatchObject({ state: 'paused', mediaReady: false })
    p.command('play')
    expect(p.state()).toMatchObject({ state: 'loading', starting: true })
    expect(p.media.map(el => el.play.mock.calls.length)).toEqual([1, 1])
    expect(p.timeline.play).not.toHaveBeenCalled()
    p.media[1]!.load()
    await vi.advanceTimersByTimeAsync(0)
    expect(p.timeline.play).not.toHaveBeenCalled()
    p.media[0]!.load()
    await vi.advanceTimersByTimeAsync(0)
    expect(p.timeline.render).toHaveBeenCalledWith(0, false, true)
    expect(p.timeline.play).toHaveBeenCalledOnce()
    expect(p.state()).toMatchObject({ state: 'playing', starting: false })
    expect(p.media[1]!.muted).toBe(false)
  })

  it('uses a genuine artwork tap when a parent message cannot authorize iOS sound', async () => {
    const p = player({ ready: 4, gestureRequired: true })
    p.command('play')
    await vi.advanceTimersByTimeAsync(0)
    expect(p.state()).toMatchObject({ needsGesture: true, state: 'paused' })
    p.tap()
    // play() is called synchronously while the artwork tap is active.
    expect(p.media[1]!.play).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(0)
    expect(p.state()).toMatchObject({ state: 'playing', needsGesture: false })
    expect(p.media[1]!.muted).toBe(false)
  })

  it('cancels a pending start and prevents late playback from escaping Pause', async () => {
    const p = player()
    p.command('play')
    p.command('pause')
    p.media.forEach(el => el.load())
    await vi.advanceTimersByTimeAsync(0)
    expect(p.timeline.play).not.toHaveBeenCalled()
    expect(p.media.every(el => el.paused)).toBe(true)
  })

  it('exits a stalled start instead of leaving an infinite preload gate', async () => {
    const p = player()
    p.command('play')
    await vi.advanceTimersByTimeAsync(15000)
    expect(p.state()).toMatchObject({ state: 'paused', starting: false, needsGesture: true })
    expect(p.media.every(el => el.paused)).toBe(true)
  })
})
