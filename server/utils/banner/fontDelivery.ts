import { createError } from 'h3'
import type { H3Event } from 'h3'
import { getAppUrl } from '~~/server/utils/appUrl'
import { resolveBannerAssetDelivery } from '~~/server/utils/banner/assetDelivery'
import { bannerAssetDeliveryUrl, isBannerAssetDeliveryKey } from '~~/server/utils/bannerStorage'

interface FontAsset {
  id: string
  r2Key: string
  uploadedBy: string
  url: string
}

/** Project existing managed font rows through the CORS-enabled asset boundary. */
export async function withBannerFontDelivery<T extends FontAsset>(event: H3Event, fonts: T[]): Promise<T[]> {
  const managed = fonts.filter(font => typeof font.id === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(font.id)
    && typeof font.r2Key === 'string' && typeof font.uploadedBy === 'string'
    && isBannerAssetDeliveryKey(font.r2Key, font.uploadedBy))
  if (!managed.length) return fonts
  const { signingSecret } = resolveBannerAssetDelivery(event)
  if (!signingSecret) throw createError({ statusCode: 503, statusMessage: 'Banner font storage is unavailable' })
  const origin = getAppUrl(event)
  const urls = new Map<string, string>()
  for (const font of managed) urls.set(font.id, await bannerAssetDeliveryUrl(font.id, origin, signingSecret))
  // Legacy external rows keep their prior URL; never grant a token for an
  // unvalidated object key or a key belonging to another uploader.
  return fonts.map(font => urls.has(font.id) ? { ...font, url: urls.get(font.id)! } : font)
}
