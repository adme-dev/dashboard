import type { BannerBrandKit, Layer } from '~/types/banner-studio'
import { brandColor, brandFont, brandFontSelection, isDarkColor } from '~/utils/banner-brand-kit'
import { motorstackBrandId } from '~~/shared/bannerBrandGuides'
import { brandStyleProfile } from '~~/shared/bannerBrandProfiles'

export type BrandTemplateVariant = 'hero' | 'dual-cta'

/** Editable native layers generated for the selected kit and each artboard size. */
export function buildBrandTemplateLayers(kit: BannerBrandKit, fmt: { w: number, h: number }, variant: BrandTemplateVariant, vehicleImageUrl?: string | null, dealerName = ''): Partial<Layer>[] {
  const { w, h } = fmt
  const brandId = motorstackBrandId(kit.sourceUrl)
  const profile = brandStyleProfile(brandId)
  const ldv = brandId === 'ldv'
  const background = variant === 'dual-cta' && (ldv || brandId === 'nissan')
    ? '#000000'
    : profile?.surface || brandColor(kit, 'background') || '#ffffff'
  const dark = isDarkColor(background)
  const foreground = profile && !(variant === 'dual-cta' && brandId === 'nissan')
    ? profile.heading
    : dark ? '#ffffff' : '#111111'
  const accent = profile?.ctaFill || brandColor(kit, 'accent') || brandColor(kit, 'primary') || '#333333'
  const heading = brandFont(kit, profile?.headingFontRole || 'heading') || brandFont(kit, 'heading')
  const body = brandFont(kit, 'body')
  const headingFace = heading ? brandFontSelection(heading) : { fontFamily: 'Arial', fontWeight: 700 }
  const bodyFace = body ? brandFontSelection(body) : { fontFamily: 'Arial', fontWeight: 400 }
  const ctaFont = brandFont(kit, profile?.ctaFontRole || 'heading') || brandFont(kit, 'body') || heading
  const ctaFace = ldv ? { fontFamily: 'Open Sans', fontWeight: 700 } : ctaFont ? brandFontSelection(ctaFont) : headingFace
  const margin = Math.max(8, Math.min(32, Math.round(Math.min(w, h) * 0.05)))
  const vehicleOnRight = !!vehicleImageUrl && w / h > 1.35
  const small = h < 150
  const contentX = small ? Math.round(w * 0.15) : margin
  const contentWidth = small ? Math.round(w * 0.32) : vehicleOnRight ? Math.round(w * 0.43) - margin : w - margin * 2
  const logo = kit.logos.find(l => l.variant === (isDarkColor(background) ? 'dark' : 'light'))
    || kit.logos.find(l => l.variant === 'any') || kit.logos[0]
  const logoWidth = Math.min(small ? 86 : 150, Math.round(w * (small ? 0.12 : 0.26)))
  const logoHeight = Math.min(small ? 25 : 42, Math.round(h * (small ? 0.28 : 0.12)))
  const headlineY = Math.round(h * (small ? 0.09 : vehicleOnRight ? 0.25 : 0.17))
  const headlineSize = Math.max(12, Math.min(small ? 18 : 56, Math.round(Math.min(contentWidth / 14, h * 0.075))))
  const buttonHeight = Math.max(22, Math.round(Math.min(h * (small ? 0.28 : 0.08), w * 0.14)))
  const buttonWidth = small ? Math.round(w * 0.19) : Math.min(contentWidth, Math.round(w * (variant === 'dual-cta' ? 0.4 : 0.56)))
  const buttonX = small ? Math.round(w * 0.79) : margin
  const buttonY = Math.round(h * (small ? 0.17 : vehicleOnRight ? 0.72 : 0.80))
  const buttonFontSize = Math.min(34, Math.max(8, Math.round((small ? h : w) * (small ? 0.12 : 0.032))))
  const base: Partial<Layer>[] = [
    { type: 'bg', name: 'Brand background', bgColor: background, x: 0, y: 0, w, h, zIndex: 0, opacity: 1, locked: true },
    { type: 'text', name: 'Headline', text: `Discover ${kit.name}`, ...headingFace, fontSize: headlineSize, color: foreground, textTransform: brandId === 'ldv' ? 'uppercase' : 'none', lineHeight: 1.05, x: contentX, y: headlineY, w: contentWidth, h: Math.round(h * (small ? 0.5 : 0.16)), zIndex: 3, opacity: 1, animIn: 'fadeIn', animInDur: 0.35, startTime: 0.1 }
  ]
  if (vehicleImageUrl) base.splice(1, 0, {
    type: 'image', name: 'MotorStack vehicle', src: vehicleImageUrl, fit: 'contain',
    x: vehicleOnRight ? Math.round(w * 0.50) : margin,
    y: Math.round(h * (small ? 0.03 : vehicleOnRight ? 0.16 : 0.36)),
    w: vehicleOnRight ? Math.round(w * (small ? 0.26 : 0.46)) : w - margin * 2,
    h: Math.round(h * (small ? 0.64 : vehicleOnRight ? 0.66 : 0.31)),
    zIndex: 1, opacity: 1, animIn: 'slideR', animInDur: 0.65, startTime: 0.1, ease: 'power2.out'
  })
  const logoX = dealerName && !vehicleOnRight ? w - margin - logoWidth : margin
  if (logo) base.push({ type: 'image', name: `${kit.name} logo`, isLogo: true, src: logo.url, fit: 'contain', x: logoX, y: margin, w: logoWidth, h: logoHeight, zIndex: 4, opacity: 1 })
  else base.push({ type: 'text', name: 'Brand name', text: kit.name, ...headingFace, fontSize: Math.max(10, Math.min(22, Math.round(w * 0.045))), color: foreground, textTransform: 'uppercase', x: margin, y: margin, w: contentWidth, h: logoHeight, zIndex: 4, opacity: 1 })
  const dealerX = vehicleOnRight && !small ? logoWidth + margin * 2 : small ? contentX : margin
  const dealerWidth = vehicleOnRight && !small ? w * 0.48 - logoWidth - margin * 3 : small ? w * 0.62 : w - logoWidth - margin * 3
  if (dealerName.trim()) base.push({ type: 'text', name: 'Dealer name', text: dealerName.trim(), ...bodyFace, fontSize: Math.max(7, Math.min(24, Math.round(w * 0.025), dealerWidth / (dealerName.trim().length * 0.55))), lineHeight: 1.1, color: foreground, x: dealerX, y: small ? Math.round(h * 0.76) : margin, w: dealerWidth, h: vehicleOnRight && !small ? logoHeight : Math.max(12, Math.round(h * 0.07)), zIndex: 4, opacity: 1, locked: true })
  if (!small && variant === 'hero') base.push({ type: 'text', name: 'Supporting copy', text: 'Discover more today', ...bodyFace, fontSize: Math.max(9, Math.min(28, Math.round(w * 0.027))), color: profile && !dark ? profile.body : foreground, x: contentX, y: Math.round(h * (vehicleOnRight ? 0.48 : 0.70)), w: contentWidth, h: Math.round(h * 0.07), zIndex: 3, opacity: 1 })

  const primaryFill = dark && brandId === 'nissan' ? '#ffffff' : accent
  const primaryText = dark && primaryFill === '#ffffff' ? '#000000' : profile?.ctaText || (isDarkColor(primaryFill) ? '#ffffff' : '#111111')
  const ctaCase = profile?.ctaCase || 'uppercase'

  const primary: Partial<Layer> = {
    type: 'button', name: 'Primary CTA', text: 'Book a test drive', ...ctaFace,
    fontSize: buttonFontSize, bgColor: primaryFill, textColor: primaryText,
    borderWidth: profile?.ctaBorder ? (brandId === 'nissan' ? 2 : 1) : 0,
    borderColor: dark && profile?.ctaBorder && isDarkColor(profile.ctaBorder) ? '#ffffff' : profile?.ctaBorder,
    borderRadius: profile?.ctaRadius ?? 2, paddingH: 10, paddingV: ldv ? 12 : 7,
    textTransform: ctaCase, x: buttonX, y: buttonY, w: buttonWidth, h: buttonHeight, zIndex: 5, opacity: 1, animIn: 'fadeIn', animInDur: 0.3, startTime: 0.7
  }
  base.push(primary)

  if (variant === 'dual-cta') {
    const gap = Math.max(6, Math.round(w * 0.02))
    const beside = !small && contentWidth >= buttonWidth * 2 + gap
    const secondY = beside ? buttonY : Math.min(h - buttonHeight - margin, buttonY + buttonHeight + gap)
    if (!beside) primary.y = Math.max(headlineY + headlineSize, secondY - buttonHeight - gap)
    base.push({
      type: 'button', name: 'Secondary CTA', text: 'Download brochure', ...ctaFace,
      fontSize: buttonFontSize, bgColor: ldv && dark ? '#ffffff' : profile?.secondaryFill || foreground,
      textColor: ldv && dark ? '#000000' : dark && profile?.secondaryFill === 'transparent' ? '#ffffff' : profile?.secondaryText || background,
      borderWidth: profile?.secondaryBorder ? (brandId === 'nissan' ? 2 : 1) : 0,
      borderColor: ldv && dark ? '#ffffff' : dark && profile?.secondaryBorder && isDarkColor(profile.secondaryBorder) ? '#ffffff' : profile?.secondaryBorder,
      borderRadius: profile?.ctaRadius ?? 2, paddingH: 10, paddingV: ldv ? 12 : 7,
      textTransform: ctaCase, x: beside ? buttonX + buttonWidth + gap : buttonX, y: secondY,
      w: buttonWidth, h: buttonHeight, zIndex: 5, opacity: 1
    })
  }
  return base.map(layer => ({ startTime: 0, endTime: 8, animIn: 'none', animInDur: 0, animOut: 'none', outDur: 0, ...layer }))
}
