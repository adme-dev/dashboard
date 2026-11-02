import type { BannerBrandKit, Layer } from '~/types/banner-studio'
import { brandButtonStyle, type BrandButtonVariant } from '~/utils/banner-brand-kit'
import { motorstackBrandId } from '~~/shared/bannerBrandGuides'
import { brandStyleProfile } from '~~/shared/bannerBrandProfiles'

export const BRAND_BUTTON_DRAG_TYPE = 'application/x-xeroflow-brand-button'

export function brandButtonDragData(kitId: string, variant: BrandButtonVariant): string {
  return JSON.stringify({ kitId, variant })
}

export function parseBrandButtonDragData(value: string): { kitId: string, variant: BrandButtonVariant } | null {
  try {
    const data = JSON.parse(value)
    if (!data || typeof data.kitId !== 'string' || !data.kitId || !['primary', 'secondary', 'dark-secondary'].includes(data.variant)) return null
    return { kitId: data.kitId, variant: data.variant }
  } catch {
    return null
  }
}

export function brandButtonDropPoint(clientX: number, clientY: number, rect: Pick<DOMRect, 'left' | 'top'>, scale: number) {
  return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale }
}

/** Build an editable native button from the selected guide, sized for its target canvas. */
export function brandGuideButtonLayer(
  kit: BannerBrandKit,
  variant: BrandButtonVariant,
  format: { w: number, h: number },
  point?: { x: number, y: number }
): Partial<Layer> | null {
  const brandId = motorstackBrandId(kit.sourceUrl)
  if (!brandStyleProfile(brandId) || (variant === 'dark-secondary' && brandId !== 'ldv')) return null
  const width = Math.max(1, Math.min(format.w - 8, brandId === 'ldv' ? 170 : 180))
  const height = Math.max(1, Math.min(format.h - 8, 42))
  const x = Math.max(0, Math.min(format.w - width, Math.round((point?.x ?? format.w / 2) - width / 2)))
  const y = Math.max(0, Math.min(format.h - height, Math.round((point?.y ?? format.h / 2) - height / 2)))
  const label = variant === 'primary' ? 'Book a test drive' : variant === 'dark-secondary' ? 'Download brochure' : 'Explore models'
  return {
    type: 'button', name: `${kit.name} ${variant === 'dark-secondary' ? 'on-dark' : variant} button`, text: label,
    brandButtonVariant: variant,
    ...brandButtonStyle(kit, variant),
    fontSize: Math.min(brandId === 'ldv' ? 13 : 14, Math.max(8, Math.round(format.w * 0.06))),
    paddingH: 10, paddingV: brandId === 'ldv' ? 12 : 7,
    x, y, w: width, h: height, animIn: 'none', animOut: 'none'
  }
}
