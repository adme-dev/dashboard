// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureFrameSize, captureVideoFrame } from '~~/app/utils/video/captureVideoFrame'

interface FakeVideo extends EventTarget {
  readyState: number
  videoWidth: number
  videoHeight: number
  preload: string
  load: ReturnType<typeof vi.fn>
}

function fakeVideo(patch: Partial<FakeVideo> = {}): FakeVideo & HTMLVideoElement {
  const video = new EventTarget() as FakeVideo
  Object.assign(video, { readyState: 4, videoWidth: 720, videoHeight: 1280, preload: 'auto', load: vi.fn(), ...patch })
  return video as FakeVideo & HTMLVideoElement
}

function stubCanvas(toBlob: (callback: (blob: Blob | null) => void, type?: string, quality?: number) => void) {
  const drawImage = vi.fn()
  const canvases: HTMLCanvasElement[] = []
  const original = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    const element = original(tag)
    if (tag === 'canvas') {
      Object.assign(element, { getContext: () => ({ drawImage }), toBlob })
      canvases.push(element as HTMLCanvasElement)
    }
    return element
  }) as typeof document.createElement)
  return { drawImage, canvases }
}

describe('capturing the video frame a mask is painted on', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

  it('draws the frame at the video\'s own size and returns a JPEG', async () => {
    const jpeg = new Blob(['frame'], { type: 'image/jpeg' })
    const types: Array<string | undefined> = []
    const { drawImage, canvases } = stubCanvas((callback, type) => { types.push(type); callback(jpeg) })
    const video = fakeVideo()

    await expect(captureVideoFrame(video)).resolves.toBe(jpeg)

    expect([canvases[0]!.width, canvases[0]!.height]).toEqual([720, 1280])
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 720, 1280)
    expect(types).toEqual(['image/jpeg'])
  })

  it('keeps the frame within what the erase worker accepts, at the same shape', () => {
    expect(captureFrameSize(1920, 1080)).toEqual({ width: 1920, height: 1080 })
    const big = captureFrameSize(7680, 4320)
    expect(big.width * big.height).toBeLessThanOrEqual(9_000_000)
    expect(Math.abs(big.width / big.height - 16 / 9)).toBeLessThan(0.01)
  })

  it('waits for the first frame when only metadata has loaded, and asks the browser to load it', async () => {
    const jpeg = new Blob(['frame'], { type: 'image/jpeg' })
    stubCanvas(callback => callback(jpeg))
    const video = fakeVideo({ readyState: 1, preload: 'metadata' })

    const pending = captureVideoFrame(video)
    expect(video.preload).toBe('auto')
    expect(video.load).toHaveBeenCalledTimes(1)
    video.readyState = 2
    video.dispatchEvent(new Event('loadeddata'))

    await expect(pending).resolves.toBe(jpeg)
  })

  it('says the video is still loading instead of sending a blank frame', async () => {
    vi.useFakeTimers()
    stubCanvas(callback => callback(new Blob()))
    const pending = captureVideoFrame(fakeVideo({ readyState: 0 }), { timeoutMs: 1000 })
    const outcome = expect(pending).rejects.toThrow('The video is still loading')
    await vi.advanceTimersByTimeAsync(1000)
    await outcome
  })

  it('fails clearly when the video cannot be loaded or the browser blocks reading it', async () => {
    stubCanvas(callback => callback(null))
    const broken = fakeVideo({ readyState: 0 })
    const pending = captureVideoFrame(broken)
    broken.dispatchEvent(new Event('error'))
    await expect(pending).rejects.toThrow('could not be loaded')

    vi.restoreAllMocks()
    stubCanvas(() => { throw Object.assign(new Error('tainted'), { name: 'SecurityError' }) })
    await expect(captureVideoFrame(fakeVideo())).rejects.toThrow('blocked reading the video frame')

    await expect(captureVideoFrame(fakeVideo({ videoWidth: 0, videoHeight: 0 }))).rejects.toThrow('no picture to capture')
  })
})
