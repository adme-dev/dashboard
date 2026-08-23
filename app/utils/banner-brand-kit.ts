import type { BannerBrandKit, BrandColorRole, BrandFontRole, BrandKitColor, BrandKitFont, Layer } from '~/types/banner-studio'

export const BRAND_COLOR_ROLES: { role: BrandColorRole, label: string, hint: string }[] = [
  { role: 'primary', label: 'Primary', hint: 'Headlines, key accents' },
  { role: 'secondary', label: 'Secondary', hint: 'Supporting text, subheads' },
  { role: 'accent', label: 'Accent', hint: 'Buttons / CTAs' },
  { role: 'background', label: 'Background', hint: 'Artboard & bg layers' },
  { role: 'text', label: 'Text', hint: 'Body copy' }
]

export const BRAND_FONT_ROLES: { role: BrandFontRole, label: string, hint: string }[] = [
  { role: 'heading', label: 'Heading', hint: 'Headlines & buttons' },
  { role: 'body', label: 'Body', hint: 'Subheads & body copy' }
]

/** Role lookup with sensible fallbacks so partial kits still apply cleanly. */
export function brandColor(kit: Pick<BannerBrandKit, 'colors'>, role: BrandColorRole): string | undefined {
  const byRole = (r: BrandColorRole) => kit.colors.find(c => c.role === r)?.hex
  // Never let a foreground role fall back to the background swatch — that renders text invisible
  const firstForeground = () => kit.colors.find(c => c.role !== 'background')?.hex
  switch (role) {
    case 'primary': return byRole('primary') || byRole('accent') || byRole('text') || firstForeground()
    case 'accent': return byRole('accent') || byRole('primary') || firstForeground()
    case 'secondary': return byRole('secondary') || byRole('text') || byRole('primary')
    case 'background': return byRole('background')
    case 'text': return byRole('text') || byRole('secondary')
    default: return byRole(role)
  }
}

export function brandFont(kit: Pick<BannerBrandKit, 'fonts'>, role: BrandFontRole): BrandKitFont | undefined {
  const byRole = (r: BrandFontRole) => kit.fonts.find(f => f.role === r)
  if (role === 'heading') return byRole('heading') || byRole('body') || kit.fonts[0]
  if (role === 'body') return byRole('body') || byRole('heading') || kit.fonts[0]
  return byRole(role)
}

/** Does this image layer look like a logo? Name match or explicit flag. */
export function isLogoLayer(layer: Layer): boolean {
  if (layer.type !== 'image') return false
  if ((layer as any).isLogo) return true
  return /\b(logo|brand|wordmark|mark)\b/i.test(layer.name || '')
}

/** Relative luminance — pick the logo variant that reads on the background */
export function isDarkColor(hex?: string): boolean {
  if (!hex) return true
  const m = /^#?([0-9a-f]{6})/i.exec(hex)
  if (!m) return true
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5
}

/** Normalise "#abc", "abc", "rgb(…)" → "#aabbcc"; null if not parseable */
export function normaliseHex(input: string): string | null {
  const s = input.trim()
  const short = /^#?([0-9a-f]{3})$/i.exec(s)
  if (short) return '#' + short[1].split('').map(ch => ch + ch).join('').toLowerCase()
  const long = /^#?([0-9a-f]{6})/i.exec(s)
  if (long) return '#' + long[1].toLowerCase()
  const rgb = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s)
  if (rgb) return '#' + [rgb[1], rgb[2], rgb[3]].map(v => Math.min(255, +v).toString(16).padStart(2, '0')).join('')
  return null
}

/** Colours present in a project that are not in the kit (for the brand-drift lint) */
export function colorDistance(a: string, b: string): number {
  const pa = normaliseHex(a), pb = normaliseHex(b)
  if (!pa || !pb) return Infinity
  const na = parseInt(pa.slice(1), 16), nb = parseInt(pb.slice(1), 16)
  const dr = ((na >> 16) & 255) - ((nb >> 16) & 255)
  const dg = ((na >> 8) & 255) - ((nb >> 8) & 255)
  const db = (na & 255) - (nb & 255)
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

export function emptyColorSet(): BrandKitColor[] {
  return []
}
