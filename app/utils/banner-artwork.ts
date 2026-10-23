import type { BannerImageCrop } from '~~/shared/bannerImageCrop'

export type ArtworkMeasure = { width: number, height: number, crop: BannerImageCrop }
const fullImage = (): BannerImageCrop => ({ x: 0, y: 0, w: 1, h: 1 })

/** Only trim a uniformly flat border or transparency; do not guess on scenery. */
export function findArtworkBounds(pixels: Uint8ClampedArray, width: number, height: number): BannerImageCrop {
  if (width < 2 || height < 2 || pixels.length !== width * height * 4) return fullImage()
  const edges: number[] = []
  for (let x = 0; x < width; x++) edges.push(x * 4, ((height - 1) * width + x) * 4)
  for (let y = 1; y < height - 1; y++) edges.push(y * width * 4, (y * width + width - 1) * 4)
  const transparent = edges.every(i => pixels[i + 3] < 16)
  const bg = [0, 1, 2].map(c => edges.reduce((sum, i) => sum + pixels[i + c], 0) / edges.length)
  const distance = (i: number) => Math.max(...bg.map((v, c) => Math.abs(pixels[i + c] - v)))
  if (!transparent && !edges.every(i => pixels[i + 3] > 240 && distance(i) < 12)) return fullImage()
  let left = width, top = height, right = -1, bottom = -1
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4
    if (pixels[i + 3] >= 16 && (transparent || distance(i) > 24)) {
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }
  if (right < left || bottom < top) return fullImage()
  // Retain room for anti-aliasing, glows and punctuation around the artwork.
  const pad = Math.max(2, Math.ceil(Math.max(right - left, bottom - top) * 0.02))
  left = Math.max(0, left - pad)
  top = Math.max(0, top - pad)
  right = Math.min(width - 1, right + pad)
  bottom = Math.min(height - 1, bottom + pad)
  return { x: left / width, y: top / height, w: (right - left + 1) / width, h: (bottom - top + 1) / height }
}

export function fitArtworkToText(text: { x: number, y: number, w: number, h: number }, image: ArtworkMeasure, canvas?: { w: number, h: number }) {
  const ratio = image.width * image.crop.w / (image.height * image.crop.h)
  const maxW = canvas?.w || Math.max(1, text.w)
  const maxH = canvas?.h || Number.POSITIVE_INFINITY
  const w = Math.min(Math.max(1, text.w), maxW, maxH * ratio)
  const h = w / ratio
  return { x: Math.max(0, Math.min(text.x + (text.w - w) / 2, maxW - w)), y: Math.max(0, Math.min(text.y + (text.h - h) / 2, maxH - h)), w, h }
}

export async function measureArtwork(url: string): Promise<ArtworkMeasure> {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Artwork image took too long to load. Try again.')), 15000)
    image.onload = () => {
      clearTimeout(timer)
      resolve()
    }
    image.onerror = () => {
      clearTimeout(timer)
      reject(new Error('Could not load artwork to fit it. Your original is unchanged.'))
    }
    image.src = url
  })
  const width = image.naturalWidth, height = image.naturalHeight
  if (!width || !height) throw new Error('Artwork has no readable dimensions')
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, 512 / Math.max(width, height))
  canvas.width = Math.max(2, Math.round(width * scale))
  canvas.height = Math.max(2, Math.round(height * scale))
  let crop = fullImage()
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (ctx) {
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      crop = findArtworkBounds(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)
    }
  } catch {
    // Some external assets permit display but not pixel reads. Preserve their full image.
  }
  return { width, height, crop }
}
