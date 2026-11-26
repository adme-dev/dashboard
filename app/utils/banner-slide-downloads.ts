import type { ArtboardState } from '~/types/banner-studio'
import { resolveBannerFormat } from './banner-constants'
import { resolveSlides } from './banner-slides'

export function planSlideDownloads(boards: Record<string, ArtboardState>, keys: string[], indices: Set<number>) {
  const formats = keys.map(key => {
    const format = resolveBannerFormat(key)
    if (!format || !boards[key]) throw new Error('A selected canvas is unavailable.')
    return { key, size: `${format.w}x${format.h}`, slides: resolveSlides(boards[key]) }
  })
  return formats.flatMap(({ key, size, slides }) => {
    const folder = formats.some(other => other.key !== key && other.size === size) ? `${size}-${key}` : size
    return slides.flatMap((_, index) => indices.has(index)
      ? [{ key, index, folder, name: `Slide-${index + 1}.jpg` }]
      : [])
  })
}
