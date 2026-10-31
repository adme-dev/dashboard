import { brandStyleProfile } from './bannerBrandProfiles'

/** Verified from the LDV Dealer Style Guide shown in MotorStack (updated 2026-08-30). */
export const LDV_GUIDE = {
  brandId: 'ldv',
  title: 'LDV Dealer Style Guide',
  updated: '2026-08-30',
  primary: '#bc3219',
  black: '#000000',
  white: '#ffffff',
  cta: {
    shape: 'square',
    case: 'uppercase',
    font: 'Open Sans',
    weight: 700,
    fontSizePx: 13,
    minWidthPx: 170,
    padding: '12px 10px',
    transition: '150ms ease-out',
    light: 'Solid red with white text, or red outline on white',
    dark: 'Solid red with white text, or white fill with black text'
  },
  layout: {
    contentColumn: '1400px + 15px inline padding',
    headingColumn: '800px centred',
    bandPadding: '40px / 90px from 768px',
    gridCell: '32.666% + 1% gutter'
  }
} as const

export function motorstackBrandId(sourceUrl?: string | null): string | null {
  if (!sourceUrl) return null
  try {
    const url = new URL(sourceUrl)
    if (url.origin !== 'https://oem-variants.pages.dev' || url.pathname !== '/api/mcp') return null
    return new URLSearchParams(url.hash.slice(1)).get('brand')
  } catch { return null }
}

export function brandGuideText(brandId: string | null): string {
  const profile = brandStyleProfile(brandId)
  if (!profile) return ''
  if (brandId !== LDV_GUIDE.brandId) {
    return [
      `${profile.label} dealer style guide (MotorStack source revision 51cb53645aba169dfae9ec8bd574b8943115bb12)`,
      `Banner surface ${profile.surface}; heading ${profile.heading}; body ${profile.body}.`,
      `Primary CTA: ${profile.ctaFill} fill, ${profile.ctaText} text, ${profile.ctaBorder || 'no'} border, ${profile.ctaRadius}px radius, ${profile.ctaCase} case.`,
      `Secondary CTA: ${profile.secondaryFill} fill, ${profile.secondaryText} text, ${profile.secondaryBorder || 'no'} border.`,
      profile.note
    ].join('\n')
  }
  return [
    `${LDV_GUIDE.title} (updated ${LDV_GUIDE.updated})`,
    `CTA: ${LDV_GUIDE.cta.shape}, ${LDV_GUIDE.cta.case}; ${LDV_GUIDE.cta.font} Bold ${LDV_GUIDE.cta.fontSizePx}px; minimum ${LDV_GUIDE.cta.minWidthPx}px; padding ${LDV_GUIDE.cta.padding}; transition ${LDV_GUIDE.cta.transition}.`,
    `On white: ${LDV_GUIDE.cta.light}. On black: ${LDV_GUIDE.cta.dark}. Avoid a red keyline on black.`,
    `Layout: content column ${LDV_GUIDE.layout.contentColumn}; heading column ${LDV_GUIDE.layout.headingColumn}; band padding ${LDV_GUIDE.layout.bandPadding}; grid cell ${LDV_GUIDE.layout.gridCell}.`,
    'Adapt these web-page dimensions proportionally for banner artboards and keep the CTA legible at export size.'
  ].join('\n')
}
