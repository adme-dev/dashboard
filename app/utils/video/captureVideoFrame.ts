// Captures the frame a video is showing, as a JPEG.
//
// Erase works on a still. A video asset has none of its own, so the Prepare
// workspace sends the frame the editor painted on together with the mask.
// The video must be served from this origin, or the canvas is tainted and
// cannot be read (see ?inline=1 on the asset stream endpoint).

// The erase worker accepts pictures up to 9 megapixels.
const MAX_FRAME_PIXELS = 9_000_000
const HAVE_CURRENT_DATA = 2

export function captureFrameSize(width: number, height: number): { width: number, height: number } {
  const scale = Math.min(1, Math.sqrt(MAX_FRAME_PIXELS / (width * height)))
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) }
}

function waitForFrame(video: HTMLVideoElement, timeoutMs: number): Promise<void> {
  if (video.readyState >= HAVE_CURRENT_DATA) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const done = (error?: Error) => {
      clearTimeout(timer)
      video.removeEventListener('loadeddata', onReady)
      video.removeEventListener('error', onError)
      if (error) reject(error)
      else resolve()
    }
    const onReady = () => done()
    const onError = () => done(new Error('The video could not be loaded, so its frame could not be captured.'))
    const timer = setTimeout(() => done(new Error('The video is still loading. Wait until you can see it, then run again.')), timeoutMs)
    video.addEventListener('loadeddata', onReady)
    video.addEventListener('error', onError)
    // preload="metadata" stops before the first frame; ask for it.
    if (video.preload !== 'auto') {
      video.preload = 'auto'
      video.load()
    }
  })
}

export async function captureVideoFrame(video: HTMLVideoElement, options: { timeoutMs?: number } = {}): Promise<Blob> {
  await waitForFrame(video, options.timeoutMs ?? 8000)
  if (!video.videoWidth || !video.videoHeight) throw new Error('The video has no picture to capture.')
  const size = captureFrameSize(video.videoWidth, video.videoHeight)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser could not capture the video frame.')
  context.drawImage(video, 0, 0, size.width, size.height)
  try {
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('This browser could not capture the video frame.')), 'image/jpeg', 0.92)
    })
  } catch (error) {
    // A cross-origin video taints the canvas: toBlob throws a SecurityError.
    if (error instanceof Error && error.name === 'SecurityError') throw new Error('This browser blocked reading the video frame.')
    throw error
  }
}
