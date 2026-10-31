import type { BannerImageCrop } from '~~/shared/bannerImageCrop'

export type CropCorner = 'nw' | 'ne' | 'sw' | 'se'
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function coverImageCrop(image: { w: number, h: number }, frame: { w: number, h: number }): BannerImageCrop {
  const ratio = (frame.w / frame.h) / (image.w / image.h)
  const w = Math.min(1, ratio), h = Math.min(1, 1 / ratio)
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h }
}

export function moveImageCrop(crop: BannerImageCrop, dx: number, dy: number): BannerImageCrop {
  return { ...crop, x: clamp(crop.x + dx, 0, 1 - crop.w), y: clamp(crop.y + dy, 0, 1 - crop.h) }
}

/** Resize around the opposite corner while retaining the crop's aspect ratio. */
export function resizeImageCrop(crop: BannerImageCrop, corner: CropCorner, dx: number, dy: number): BannerImageCrop {
  const sx = corner.includes('e') ? 1 : -1, sy = corner.includes('s') ? 1 : -1
  const ax = sx === 1 ? crop.x : crop.x + crop.w, ay = sy === 1 ? crop.y : crop.y + crop.h
  const ratio = crop.w / crop.h
  const proposedW = crop.w + (sx * dx + sy * dy * ratio) / 2
  const maxW = Math.min(sx === 1 ? 1 - ax : ax, (sy === 1 ? 1 - ay : ay) * ratio)
  const w = clamp(proposedW, Math.min(0.02, maxW), maxW), h = w / ratio
  return { x: sx === 1 ? ax : ax - w, y: sy === 1 ? ay : ay - h, w, h }
}
