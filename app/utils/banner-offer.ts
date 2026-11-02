import type { BannerAsset, BannerBrandKit, Layer } from '~/types/banner-studio'
import { brandColor, brandFont, brandFontSelection, isDarkColor } from '~/utils/banner-brand-kit'

export interface BannerMotorStackOffer {
  title: string | null
  model: string | null
  variant: string | null
  price: number | null
  priceLabel: string | null
  offer: string | null
  endDate: string | null
  disclaimer: string | null
  hasImage: boolean
  artworkAssetId: string | null
  artworkPreviewUrl: string | null
}

/** Editable offer pieces, positioned independently for each canvas size. */
export function bannerOfferLayers(
  offer: BannerMotorStackOffer,
  kit: BannerBrandKit,
  format: { w: number, h: number },
  image?: BannerAsset
): Array<{ role: string, layer: Partial<Layer> }> {
  const { w, h } = format
  const landscape = w / h > 1.2
  const textColor = brandColor(kit, 'text') || (isDarkColor(brandColor(kit, 'background')) ? '#ffffff' : '#111111')
  const headingFont = brandFont(kit, 'heading')
  const bodyFont = brandFont(kit, 'body')
  const headingFace = headingFont ? brandFontSelection(headingFont) : null
  const bodyFace = bodyFont ? brandFontSelection(bodyFont) : {}
  const headline = offer.title || offer.offer || 'Offer'
  const detail = offer.offer && offer.offer !== headline ? offer.offer : null
  const formattedPrice = offer.price === null ? null : new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(offer.price)
  const price = offer.priceLabel || formattedPrice
  const priceLine = price && !headline.includes(price) && !(formattedPrice && headline.includes(formattedPrice)) ? price : null
  const terms = [offer.disclaimer, offer.endDate ? `Offer ends ${offer.endDate}` : null].filter(Boolean).join('\n')
  const short = Math.min(w, h)
  const contentX = Math.round(w * (landscape ? 0.05 : 0.07))
  const contentW = Math.round(w * (landscape && image ? 0.4 : 0.86))
  const headlineY = Math.round(h * (image && !landscape ? 0.54 : 0.12))
  const headlineH = Math.round(h * (landscape ? 0.35 : image ? 0.16 : 0.3))
  const result: Array<{ role: string, layer: Partial<Layer> }> = []
  if (image) result.push({ role: 'hero', layer: {
    type: 'image', name: `${offer.model || kit.name} offer hero`, src: image.url, fit: 'contain',
    x: Math.round(w * (landscape ? 0.48 : 0.07)), y: Math.round(h * 0.06),
    w: Math.round(w * (landscape ? 0.47 : 0.86)), h: Math.round(h * (landscape ? 0.7 : 0.45)),
    animIn: 'none', animOut: 'none'
  } })
  result.push({ role: 'headline', layer: {
    type: 'text', name: 'Offer headline', text: headline, ...headingFace, color: textColor,
    fontSize: Math.max(14, Math.round(short * (landscape ? 0.085 : 0.075))), fontWeight: headingFace?.fontWeight || 700,
    lineHeight: 1.05, textTransform: 'none', x: contentX, y: headlineY, w: contentW, h: headlineH,
    animIn: 'none', animOut: 'none'
  } })
  if (detail) result.push({ role: 'detail', layer: {
    type: 'text', name: 'Offer detail', text: detail, ...bodyFace, color: textColor,
    fontSize: Math.max(10, Math.round(short * 0.04)), lineHeight: 1.2,
    x: contentX, y: Math.round(h * (landscape ? 0.51 : image ? 0.71 : 0.49)), w: contentW, h: Math.round(h * 0.13),
    animIn: 'none', animOut: 'none'
  } })
  if (priceLine) result.push({ role: 'price', layer: {
    type: 'text', name: 'Offer price', text: priceLine, ...headingFace, color: textColor,
    fontSize: Math.max(13, Math.round(short * 0.065)), fontWeight: headingFace?.fontWeight || 700,
    x: contentX, y: Math.round(h * (landscape ? 0.66 : image ? 0.72 : 0.52)), w: contentW, h: Math.round(h * 0.1),
    animIn: 'none', animOut: 'none'
  } })
  if (terms) result.push({ role: 'terms', layer: {
    type: 'text', name: 'Offer terms — review fit', text: terms, ...bodyFace, color: textColor,
    fontSize: Math.max(8, Math.round(short * 0.025)), lineHeight: 1.15,
    x: Math.round(w * 0.05), y: Math.round(h * 0.84), w: Math.round(w * 0.9), h: Math.round(h * 0.14),
    animIn: 'none', animOut: 'none'
  } })
  return result
}
