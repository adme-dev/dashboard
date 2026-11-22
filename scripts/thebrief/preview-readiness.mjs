// Serialized into the private comparison frames; only converter-validated local
// artwork URLs are passed here. A rendered frame is not evidence until decoded.
export async function waitForPreviewAssets(urls, timeoutMs = 20000) {
  let timer
  try {
    await Promise.race([
      Promise.all([
        Promise.all([...document.fonts].map(async (font) => {
          try {
            await font.load()
          } catch {
            throw new Error('A comparison font failed to load')
          }
        })).then(() => document.fonts.ready),
        ...[...new Set(urls)].map(async (url) => {
          if (/\.mp4$/i.test(url)) {
            const video = document.createElement('video')
            video.preload = 'auto'
            video.muted = true
            await new Promise((resolve, reject) => {
              video.onloadeddata = resolve
              video.onerror = () => reject(new Error(`Video failed to decode: ${url}`))
              video.src = url
              video.load()
            })
            if (!video.videoWidth || !video.videoHeight) throw new Error(`Video has no frames: ${url}`)
            return
          }
          const image = new Image()
          image.src = url
          try {
            await image.decode()
          } catch {
            throw new Error(`Artwork failed to decode: ${url}`)
          }
          if (!image.naturalWidth || !image.naturalHeight) throw new Error(`Artwork has no pixels: ${url}`)
        })
      ]),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Artwork or fonts did not become ready within 20 seconds')), timeoutMs) })
    ])
    if ([...document.fonts].some(font => font.status === 'error')) throw new Error('A comparison font failed to load')
  } finally { clearTimeout(timer) }
}
