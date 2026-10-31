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
