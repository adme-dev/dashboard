import type { BannerBrandKit, Layer } from '~/types/banner-studio'
import { brandColor, brandFont, brandFontSelection, isDarkColor } from '~/utils/banner-brand-kit'
import { motorstackBrandId } from '~~/shared/bannerBrandGuides'
import { brandStyleProfile } from '~~/shared/bannerBrandProfiles'

export type BrandTemplateVariant = 'hero' | 'dual-cta'

/** Editable native layers generated for the selected kit and each artboard size. */
export function buildBrandTemplateLayers(kit: BannerBrandKit, fmt: { w: number, h: number }, variant: BrandTemplateVariant, vehicleImageUrl?: string | null): Partial<Layer>[] {
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
  const inset = Math.max(10, Math.round(Math.min(w * 0.05, 32)))
  const vehicleOnRight = !!vehicleImageUrl && w / h > 1.35
  const contentWidth = vehicleOnRight ? Math.round(w * 0.51) - inset : w - inset * 2
  const small = h < 150
  const logo = kit.logos.find(l => l.variant === (isDarkColor(background) ? 'dark' : 'light'))
    || kit.logos.find(l => l.variant === 'any') || kit.logos[0]
  const logoWidth = Math.min(150, Math.round(w * 0.26))
  const logoHeight = Math.min(42, Math.round(h * 0.17))
  const headlineY = Math.round(h * (small ? 0.24 : 0.30))
  const headlineSize = Math.max(14, Math.min(56, Math.round(Math.min(w * 0.105, h * 0.23))))
  const buttonHeight = Math.max(22, Math.min(42, Math.round(h * 0.17)))
  const buttonWidth = Math.min(contentWidth, ldv ? Math.min(170, Math.round(w * 0.57)) : Math.max(90, Math.round(w * 0.48)))
  const buttonY = Math.min(h - buttonHeight - inset, Math.round(h * (small ? 0.66 : 0.74)))
  const buttonFontSize = ldv ? Math.min(13, Math.max(8, Math.round(w * 0.043))) : Math.min(14, Math.max(8, Math.round(w * 0.04)))
  const base: Partial<Layer>[] = [
    { type: 'bg', name: 'Brand background', bgColor: background, x: 0, y: 0, w, h, zIndex: 0, opacity: 1, locked: true },
    { type: 'text', name: 'Headline', text: `Discover ${kit.name}`, ...headingFace, fontSize: headlineSize, color: foreground, textTransform: brandId === 'ldv' ? 'uppercase' : 'none', lineHeight: 1.05, x: inset, y: headlineY, w: contentWidth, h: Math.min(h - headlineY, Math.round(headlineSize * 2.3)), zIndex: 3, opacity: 1 }
  ]
  if (vehicleImageUrl) base.splice(1, 0, {
    type: 'image', name: 'MotorStack vehicle', src: vehicleImageUrl, fit: 'contain',
    x: vehicleOnRight ? Math.round(w * 0.43) : Math.round(w * 0.18),
    y: vehicleOnRight ? Math.round(h * 0.08) : Math.round(h * 0.42),
    w: vehicleOnRight ? Math.round(w * 0.57) : Math.round(w * 0.82),
    h: vehicleOnRight ? Math.round(h * 0.82) : Math.round(h * 0.50),
    zIndex: 1, opacity: 1
  })
  if (logo) base.push({ type: 'image', name: `${kit.name} logo`, isLogo: true, src: logo.url, fit: 'contain', x: inset, y: inset, w: logoWidth, h: logoHeight, zIndex: 4, opacity: 1 })
  else base.push({ type: 'text', name: 'Brand name', text: kit.name, ...headingFace, fontSize: Math.max(10, Math.min(22, Math.round(w * 0.045))), color: foreground, textTransform: 'uppercase', x: inset, y: inset, w: contentWidth, h: logoHeight, zIndex: 4, opacity: 1 })
  if (!small && variant === 'hero') base.push({ type: 'text', name: 'Supporting copy', text: 'Discover more today', ...bodyFace, fontSize: Math.max(9, Math.min(18, Math.round(w * 0.035))), color: profile && !dark ? profile.body : foreground, x: inset, y: Math.round(h * 0.57), w: contentWidth, h: Math.round(h * 0.12), zIndex: 3, opacity: 1 })

  const primaryFill = dark && brandId === 'nissan' ? '#ffffff' : accent
  const primaryText = dark && primaryFill === '#ffffff' ? '#000000' : profile?.ctaText || (isDarkColor(primaryFill) ? '#ffffff' : '#111111')
  const ctaCase = profile?.ctaCase || 'uppercase'

  const primary: Partial<Layer> = {
    type: 'button', name: 'Primary CTA', text: 'Book a test drive', ...ctaFace,
    fontSize: buttonFontSize, bgColor: primaryFill, textColor: primaryText,
    borderWidth: profile?.ctaBorder ? (brandId === 'nissan' ? 2 : 1) : 0,
    borderColor: dark && profile?.ctaBorder && isDarkColor(profile.ctaBorder) ? '#ffffff' : profile?.ctaBorder,
    borderRadius: profile?.ctaRadius ?? 2, paddingH: 10, paddingV: ldv ? 12 : 7,
    textTransform: ctaCase, x: inset, y: buttonY, w: buttonWidth, h: buttonHeight, zIndex: 5, opacity: 1
  }
  base.push(primary)

  if (variant === 'dual-cta') {
    const gap = Math.max(6, Math.round(w * 0.02))
    const beside = contentWidth >= buttonWidth * 2 + gap
    const secondY = beside ? buttonY : Math.min(h - buttonHeight - inset, buttonY + buttonHeight + gap)
    if (!beside) primary.y = Math.max(headlineY + headlineSize, secondY - buttonHeight - gap)
    base.push({
      type: 'button', name: 'Secondary CTA', text: 'Download brochure', ...ctaFace,
      fontSize: buttonFontSize, bgColor: ldv && dark ? '#ffffff' : profile?.secondaryFill || foreground,
      textColor: ldv && dark ? '#000000' : dark && profile?.secondaryFill === 'transparent' ? '#ffffff' : profile?.secondaryText || background,
      borderWidth: profile?.secondaryBorder ? (brandId === 'nissan' ? 2 : 1) : 0,
      borderColor: ldv && dark ? '#ffffff' : dark && profile?.secondaryBorder && isDarkColor(profile.secondaryBorder) ? '#ffffff' : profile?.secondaryBorder,
      borderRadius: profile?.ctaRadius ?? 2, paddingH: 10, paddingV: ldv ? 12 : 7,
      textTransform: ctaCase, x: beside ? inset + buttonWidth + gap : inset, y: secondY,
      w: buttonWidth, h: buttonHeight, zIndex: 5, opacity: 1
    })
  }
  return base
}
