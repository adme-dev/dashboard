// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBannerVideoTransport } from '~/utils/bannerVideoPlayback'
import { useBannerTimeline } from '~/composables/useBannerTimeline'
import type { Layer } from '~/types/banner-studio'

function media() {
  const video = document.createElement('video')
  let time = 0, paused = true, seeking = false
  const seeks: number[] = []
  Object.defineProperties(video, {
    duration: { value: 20 },
    paused: { get: () => paused },
    seeking: { get: () => seeking },
    currentTime: { get: () => time, set: (value) => {
      time = value
      seeks.push(value)
    } }
  })
  video.play = vi.fn(async () => {
    paused = false
  })
  video.pause = vi.fn(() => {
    paused = true
  })
  return { video, seeks, advance: (value: number) => {
    time = value
  }, seeking: (value: boolean) => {
    seeking = value
  } }
}
const clock = { startTime: 0, endTime: 10 }
const cleanup: Array<() => void> = []
afterEach(() => {
  cleanup.splice(0).forEach(fn => fn())
  vi.unstubAllGlobals()
})

describe('continuous editable video playback', () => {
  it('lets 120 decoded frames advance without any per-frame seek', async () => {
    const m = media(), transport = createBannerVideoTransport()
    cleanup.push(transport.dispose)
    for (let frame = 0; frame < 120; frame++) {
      m.advance(frame / 60)
      transport.sync(m.video, frame / 60, true, clock)
      await Promise.resolve()
    }
    expect(m.seeks).toEqual([])
    expect(m.video.play).toHaveBeenCalledTimes(1)
    expect(m.video.paused).toBe(false)
    transport.sync(m.video, 2, false, clock)
    expect(m.video.paused).toBe(true)
  })
  it('retains trim points, looping, delayed presence and the final hold', () => {
    const m = media(), transport = createBannerVideoTransport()
    cleanup.push(transport.dispose)
    const trimmed = { startTime: 3, endTime: 12, mediaStart: 5, mediaEnd: 7 }
    transport.sync(m.video, 0, true, trimmed)
    expect(m.video.currentTime).toBe(5)
    expect(m.video.paused).toBe(true)
    transport.sync(m.video, 6, false, trimmed)
    expect(m.video.currentTime).toBe(7)
    transport.sync(m.video, 6, false, { ...trimmed, mediaLoop: true })
    expect(m.video.currentTime).toBe(6)
    transport.sync(m.video, 12, true, trimmed)
    expect(m.video.paused).toBe(true)
    expect(m.video.currentTime).toBe(7)
  })
  it('coalesces scrubs while a frame is decoding and lands on the newest target', () => {
    const m = media(), transport = createBannerVideoTransport()
    cleanup.push(transport.dispose)
    transport.sync(m.video, 1, false, clock)
    m.seeking(true)
    for (let frame = 2; frame <= 9; frame++) transport.sync(m.video, frame, false, clock)
    expect(m.seeks).toEqual([1])
    m.seeking(false)
    m.video.dispatchEvent(new Event('seeked'))
    expect(m.seeks).toEqual([1, 9])
  })
  it('resets a short trimmed loop immediately even below the drift threshold', () => {
    const m = media(), transport = createBannerVideoTransport()
    cleanup.push(transport.dispose)
    const loop = { startTime: 0, endTime: 10, mediaStart: 0, mediaEnd: 0.2, mediaLoop: true }
    transport.sync(m.video, 0.19, true, loop)
    m.advance(0.21)
    transport.sync(m.video, 0.21, true, loop)
    expect(m.video.currentTime).toBeCloseTo(0.01)
  })
  it('corrects real drift, waits for the decoder and stops a pending play at a scene boundary', async () => {
    const m = media(), transport = createBannerVideoTransport()
    cleanup.push(transport.dispose)
    let complete!: () => void
    m.video.play = vi.fn(() => new Promise<void>((resolve) => {
      complete = resolve
    }))
    transport.sync(m.video, 4, true, clock)
    expect(m.seeks).toEqual([4])
    m.seeking(true)
    transport.sync(m.video, 4.02, true, clock)
    expect(m.seeks).toEqual([4])
    transport.sync(m.video, 10, true, clock)
    complete()
    await Promise.resolve()
    expect(m.video.paused).toBe(true)
  })
  it('does not let an old pending play pause a replacement owner', async () => {
    const m = media(), first = createBannerVideoTransport(), second = createBannerVideoTransport()
    cleanup.push(first.dispose, second.dispose)
    let complete!: () => void
    m.video.play = vi.fn(() => new Promise<void>((resolve) => {
      complete = resolve
    }))
    first.sync(m.video, 0, true, clock)
    const oldComplete = complete
    first.dispose()
    second.sync(m.video, 0, true, clock)
    const pauseCount = vi.mocked(m.video.pause).mock.calls.length
    oldComplete()
    await Promise.resolve()
    expect(m.video.pause).toHaveBeenCalledTimes(pauseCount)
  })
  it('runs inside the real editor timeline without disturbing audio or editable motion', async () => {
    const m = media(), root = document.createElement('div'), element = document.createElement('div')
    element.id = 'lyr-1'
    element.append(m.video)
    root.append(element)
    const layer = { id: 1, type: 'video', startTime: 0, endTime: 10, opacity: 1, x: 0, y: 0, w: 100, h: 100, animIn: 'none', animOut: 'none', keyframes: { scaleX: [{ time: 0, value: 1 }, { time: 10, value: 1.2 }], scaleY: [{ time: 0, value: 1 }, { time: 10, value: 1.2 }] } } as Layer
    const state = { activeKey: 'square', sets: { square: { playback: { duration: 10, loopCount: 0 } } }, duration: 10, currentTime: 0, isPlaying: false, isLooping: false }
    vi.stubGlobal('useBannerStudio', () => ({ state, activeLayers: { value: [layer] } }))
    const editor = useBannerTimeline()
    cleanup.push(editor.destroyTimeline)
    const timeline = editor.buildTimeline(root, [layer])
    editor.playTimeline()
    await Promise.resolve()
    m.seeks.length = 0
    for (let frame = 1; frame < 120; frame++) {
      m.advance(frame / 60)
      timeline.time(frame / 60, false)
    }
    expect(m.seeks).toEqual([])
    expect(element.style.transform).toContain('scale')
    editor.pauseTimeline()
    expect(m.video.paused).toBe(true)
    editor.seekTo(7)
    expect(m.video.currentTime).toBe(7)
    editor.playTimeline()
    editor.destroyTimeline({ preserveTime: true })
    expect(m.video.paused).toBe(true)
    expect(state.currentTime).toBeCloseTo(7)
  })
})
