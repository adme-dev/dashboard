import type { BannerAsset, Layer } from '~/types/banner-studio'

export type BannerMediaType = 'all' | 'image' | 'video' | 'audio'

export function bannerAssetType(asset: Pick<BannerAsset, 'mimeType'>): Exclude<BannerMediaType, 'all'> | undefined {
  const type = asset.mimeType?.split('/')[0]
  return type === 'image' || type === 'video' || type === 'audio' ? type : undefined
}

/** Contain preserves the complete uploaded image, including transparent vehicle cutouts. */
export function bannerAssetLayer(asset: BannerAsset, format: { w: number, h: number }): Partial<Layer> {
  const type = bannerAssetType(asset)
  if (!type) throw new Error('Choose an image, video or audio file.')
  if (type === 'audio') return { type, src: asset.url, name: asset.name, x: 0, y: 0, w: 0, h: 0, volume: 1, animIn: 'none', animOut: 'none' }
  const ratio = type === 'video' ? 16 / 9 : 4 / 3
  const w = Math.min(format.w * 0.65, format.h * 0.65 * ratio)
  const h = w / ratio
  return { type, src: asset.url, name: asset.name, x: (format.w - w) / 2, y: (format.h - h) / 2, w, h, fit: 'contain', animIn: 'none', animOut: 'none' }
}
