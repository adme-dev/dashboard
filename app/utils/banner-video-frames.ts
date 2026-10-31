import type { BannerVideoClock } from '~~/shared/bannerVideoClock'
import { videoFrameTimes } from './banner-video-edit'

const cache = new Map<string, string[]>()
let decoders = 0
const waiting: (() => void)[] = []
function acquireDecoder(signal: AbortSignal): Promise<() => void> {
  return new Promise((resolve, reject) => {
    const aborted = () => {
      const index = waiting.indexOf(start)
      if (index >= 0) waiting.splice(index, 1)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    const start = () => {
      signal.removeEventListener('abort', aborted)
      if (signal.aborted) {
        aborted()
        return
      }
      decoders++
      resolve(() => {
        decoders--
        waiting.shift()?.()
      })
    }
    if (signal.aborted) {
      aborted()
      return
    }
    if (decoders < 2) start()
    else {
      waiting.push(start)
      signal.addEventListener('abort', aborted, { once: true })
    }
  })
}

function mediaEvent(
  video: HTMLVideoElement,
  event: string,
  signal: AbortSignal,
  action: () => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      video.removeEventListener(event, done)
      video.removeEventListener('error', failed)
      signal.removeEventListener('abort', aborted)
    }
    const done = () => {
      cleanup()
      resolve()
    }
    const failed = () => {
      cleanup()
      reject(new Error('Video preview unavailable'))
    }
    const aborted = () => {
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    const timer = setTimeout(failed, 15000)
    if (signal.aborted) return aborted()
    video.addEventListener(event, done, { once: true })
    video.addEventListener('error', failed, { once: true })
    signal.addEventListener('abort', aborted, { once: true })
    try {
      action()
    } catch {
      failed()
    }
  })
}

/** One temporary decoder per visible strip, released on success, cancellation or error. */
export async function videoFrames(
  src: string,
  clock: BannerVideoClock,
  span: number,
  signal: AbortSignal
): Promise<string[]> {
  const key = JSON.stringify([
    src,
    clock.mediaStart,
    clock.mediaEnd,
    clock.mediaLoop,
    span
  ])
  const cached = cache.get(key)
  if (cached) {
    cache.delete(key)
    cache.set(key, cached)
    return cached
  }
  const release = await acquireDecoder(signal)
  const video = document.createElement('video')
  video.crossOrigin = 'anonymous'
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  try {
    await mediaEvent(video, 'loadeddata', signal, () => {
      video.src = src
      video.load()
    })
    const times = videoFrameTimes(clock, video.duration, span)
    if (!times.length || !video.videoWidth || !video.videoHeight) return []
    const canvas = document.createElement('canvas')
    canvas.width = 96
    canvas.height = 54
    const ctx = canvas.getContext('2d')
    if (!ctx) return []
    const frames: string[] = []
    for (const time of times) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      if (Math.abs(video.currentTime - time) > 0.0001) {
        await mediaEvent(video, 'seeked', signal, () => {
          video.currentTime = time
        })
      }
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      const scale = Math.min(
        canvas.width / video.videoWidth,
        canvas.height / video.videoHeight
      )
      const width = video.videoWidth * scale,
        height = video.videoHeight * scale
      ctx.drawImage(
        video,
        (canvas.width - width) / 2,
        (canvas.height - height) / 2,
        width,
        height
      )
      frames.push(canvas.toDataURL('image/jpeg', 0.65))
    }
    cache.set(key, frames)
    if (cache.size > 24) cache.delete(cache.keys().next().value!)
    return frames
  } finally {
    video.pause()
    video.removeAttribute('src')
    video.load()
    release()
  }
}
