// Reads what the library needs from a file before it is uploaded: its size, its
// length, and a preview frame.
//
// The server runs on Workers and cannot decode video, so the browser captures the
// frame. Without one a video has no still, and the picture tools in Prepare
// (separate layers, lift, remove background) have nothing to work on.
import { captureVideoFrame } from '~~/app/utils/video/captureVideoFrame'

export interface MediaUploadPreview {
  width: number | null
  height: number | null
  durationSec: number | null
  // JPEG preview frame. Null for a PNG or JPEG picture (it is its own preview) or when capture failed.
  poster: Blob | null
}

const EMPTY: MediaUploadPreview = { width: null, height: null, durationSec: null, poster: null }
const LOAD_TIMEOUT_MS = 8000

// A little way in: the very first frame of a clip is often black or a fade.
export function posterTimeSec(durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0
  return Math.min(1, durationSec / 2)
}

// PNG and JPEG are read by the Prepare tools as they are. Anything else needs a JPEG frame.
export function pictureNeedsPoster(mimeType: string): boolean {
  return mimeType !== 'image/png' && mimeType !== 'image/jpeg'
}

function once(target: EventTarget, okEvent: string, timeoutMs = LOAD_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (error?: Error) => {
      clearTimeout(timer)
      target.removeEventListener(okEvent, onOk)
      target.removeEventListener('error', onError)
      if (error) reject(error)
      else resolve()
    }
    const onOk = () => done()
    const onError = () => done(new Error('The file could not be read.'))
    const timer = setTimeout(() => done(new Error('The file took too long to read.')), timeoutMs)
    target.addEventListener(okEvent, onOk)
    target.addEventListener('error', onError)
  })
}

async function videoPreview(file: File): Promise<MediaUploadPreview> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  try {
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    const metadata = once(video, 'loadedmetadata')
    video.src = url
    await metadata
    const durationSec = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null
    const size = { width: video.videoWidth || null, height: video.videoHeight || null }
    let poster: Blob | null = null
    try {
      const target = posterTimeSec(durationSec ?? 0)
      if (target > 0) {
        const seeked = once(video, 'seeked')
        video.currentTime = target
        await seeked
      }
      poster = await captureVideoFrame(video, { timeoutMs: LOAD_TIMEOUT_MS })
    } catch {
      // No frame: the upload still goes ahead, and Prepare saves one the first time it is needed.
    }
    return { ...size, durationSec, poster }
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}

async function picturePreview(file: File): Promise<MediaUploadPreview> {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    const loaded = once(image, 'load')
    image.src = url
    await loaded
    const width = image.naturalWidth || null
    const height = image.naturalHeight || null
    if (!width || !height || !pictureNeedsPoster(file.type)) return { width, height, durationSec: null, poster: null }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return { width, height, durationSec: null, poster: null }
    context.drawImage(image, 0, 0, width, height)
    const poster = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    return { width, height, durationSec: null, poster }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Never throws: a file the browser cannot read is uploaded without a preview. */
export async function readMediaUploadPreview(file: File, kind: 'footage' | 'still'): Promise<MediaUploadPreview> {
  try {
    return kind === 'footage' ? await videoPreview(file) : await picturePreview(file)
  } catch {
    return { ...EMPTY }
  }
}

/** The multipart body the upload-media endpoint reads. */
export function mediaUploadForm(file: File, kind: 'footage' | 'still', preview: MediaUploadPreview): FormData {
  const form = new FormData()
  form.append('file', file)
  form.append('kind', kind)
  if (preview.width && preview.height) {
    form.append('width', String(preview.width))
    form.append('height', String(preview.height))
  }
  if (preview.durationSec) form.append('durationSec', String(preview.durationSec))
  if (preview.poster) form.append('poster', preview.poster, 'poster.jpg')
  return form
}

export function mediaUploadKind(file: File): 'footage' | 'still' | null {
  if (['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type)) return 'footage'
  if (['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'still'
  return null
}
