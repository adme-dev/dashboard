export type BannerImageCrop = { x: number, y: number, w: number, h: number }

/** Crop coordinates are fractions of the untouched source image. */
export function bannerImageCropCss(crop?: BannerImageCrop): string {
  if (!crop || ![crop.x, crop.y, crop.w, crop.h].every(Number.isFinite)
    || crop.x < 0 || crop.y < 0 || crop.w <= 0 || crop.h <= 0
    || crop.x + crop.w > 1.000001 || crop.y + crop.h > 1.000001) return ''
  return `position:absolute;max-width:none;width:${100 / crop.w}%;height:${100 / crop.h}%;left:${-100 * crop.x / crop.w}%;top:${-100 * crop.y / crop.h}%;`
}
