// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { videoFrames } from '~/utils/banner-video-frames'

afterEach(() => vi.restoreAllMocks())

function mockMedia(load = true) {
  const videos: HTMLVideoElement[] = []
  const original = document.createElement.bind(document)
  const drawImage = vi.fn()
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    const element = original(tag)
    if (tag === 'video') {
      const video = element as HTMLVideoElement
      videos.push(video)
      let time = 0
      Object.defineProperties(video, {
        duration: { value: 8 },
        videoWidth: { value: 1280 },
        videoHeight: { value: 720 },
        currentTime: {
          get: () => time,
          set: (value) => {
            time = value
            queueMicrotask(() => video.dispatchEvent(new Event('seeked')))
          }
        }
      })
      vi.spyOn(video, 'load').mockImplementation(() => {
        if (load && video.hasAttribute('src'))
          queueMicrotask(() => video.dispatchEvent(new Event('loadeddata')))
      })
      vi.spyOn(video, 'pause').mockImplementation(() => {})
    }
    if (tag === 'canvas') {
      const canvas = element as HTMLCanvasElement
      vi.spyOn(canvas, 'getContext').mockReturnValue({
        fillRect: vi.fn(),
        drawImage
      } as unknown as CanvasRenderingContext2D)
      vi.spyOn(canvas, 'toDataURL').mockReturnValue(
        'data:image/jpeg;base64,frame'
      )
    }
    return element
  }) as typeof document.createElement)
  return { videos, drawImage }
}

it('samples frames, releases the decoder, and caches only finished strips', async () => {
  const { videos, drawImage } = mockMedia()
  const signal = new AbortController().signal
  expect(
    await videoFrames(
      '/frames-success.mp4',
      { mediaStart: 2, mediaEnd: 4 },
      4,
      signal
    )
  ).toHaveLength(12)
  expect(drawImage).toHaveBeenCalledTimes(12)
  expect(videos[0].hasAttribute('src')).toBe(false)
  expect(videos[0].pause).toHaveBeenCalled()
  await videoFrames(
    '/frames-success.mp4',
    { mediaStart: 2, mediaEnd: 4 },
    4,
    signal
  )
  expect(videos).toHaveLength(1)
})

it('bounds concurrent decoding and removes cancelled queued work without starting it', async () => {
  const { videos } = mockMedia(false)
  const controllers = Array.from({ length: 3 }, () => new AbortController())
  const pending = controllers.map((controller, i) =>
    videoFrames(`/frames-cancel-${i}.mp4`, {}, 4, controller.signal).catch(
      error => error.name
    )
  )
  await Promise.resolve()
  expect(videos).toHaveLength(2)
  controllers[2].abort()
  controllers[0].abort()
  controllers[1].abort()
  expect(await Promise.all(pending)).toEqual([
    'AbortError',
    'AbortError',
    'AbortError'
  ])
  expect(videos.every(video => !video.hasAttribute('src'))).toBe(true)
})

it('releases failed media and permits retry rather than caching a failure', async () => {
  const { videos } = mockMedia(false)
  const failed = videoFrames(
    '/frames-error.mp4',
    {},
    4,
    new AbortController().signal
  )
  const assertion = expect(failed).rejects.toThrow('Video preview unavailable')
  await Promise.resolve()
  videos[0].dispatchEvent(new Event('error'))
  await assertion
  expect(videos[0].hasAttribute('src')).toBe(false)
  const controller = new AbortController()
  const retry = videoFrames(
    '/frames-error.mp4',
    {},
    4,
    controller.signal
  ).catch(error => error.name)
  await Promise.resolve()
  expect(videos).toHaveLength(2)
  controller.abort()
  expect(await retry).toBe('AbortError')
})
