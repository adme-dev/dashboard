/**
 * Brand-drift lint: flag colours and fonts in a banner that aren't in the client's brand kit.
 * Produces ValidationRule entries so they surface in the existing export compliance UI.
 */
import type { ValidationRule } from '~~/server/utils/bannerValidator'

function hex6(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const s = input.trim()
  const short = /^#([0-9a-f]{3})$/i.exec(s)
  if (short) return '#' + short[1].split('').map(c => c + c).join('').toLowerCase()
  const long = /^#([0-9a-f]{6})/i.exec(s)
  return long ? '#' + long[1].toLowerCase() : null
}
function dist(a: string, b: string): number {
  const na = parseInt(a.slice(1), 16), nb = parseInt(b.slice(1), 16)
  const dr = ((na >> 16) & 255) - ((nb >> 16) & 255)
  const dg = ((na >> 8) & 255) - ((nb >> 8) & 255)
  const db = (na & 255) - (nb & 255)
  return Math.sqrt(dr * dr + dg * dg + db * db)
}
const NEUTRALS = new Set(['#000000', '#ffffff'])
const TOLERANCE = 24 // RGB distance — allows slight tint/opacity variants

export function brandDriftRules(
  layers: any[],
  kit: { name: string, colors: { hex: string, role: string }[], fonts: { family: string }[] } | null
): ValidationRule[] {
  if (!kit) return []
  const rules: ValidationRule[] = []
  const kitHex = kit.colors.map(c => hex6(c.hex)).filter(Boolean) as string[]
  const kitFonts = new Set(kit.fonts.map(f => f.family.toLowerCase()))

  if (kitHex.length) {
    const offBrand = new Map<string, string[]>() // hex → layer names
    for (const l of layers) {
      for (const key of ['color', 'bgColor', 'textColor', 'borderColor']) {
        const h = hex6(l?.[key])
        if (!h || NEUTRALS.has(h)) continue
        if (kitHex.some(k => dist(k, h) <= TOLERANCE)) continue
        const names = offBrand.get(h) || []
        if (l.name && !names.includes(l.name)) names.push(l.name)
        offBrand.set(h, names)
      }
    }
    for (const [h, names] of offBrand) {
      rules.push({
        id: `brand-color-${h.slice(1)}`,
        platform: 'general',
        severity: 'warning',
        message: `${h} isn't in the "${kit.name}" palette${names.length ? ` (${names.slice(0, 3).join(', ')})` : ''}`,
        fix: `Use a brand colour: ${kit.colors.slice(0, 4).map(c => `${c.role} ${c.hex}`).join(', ')}`
      })
    }
  }

  if (kitFonts.size) {
    const offFonts = new Set<string>()
    for (const l of layers) {
      if ((l?.type === 'text' || l?.type === 'button') && l.fontFamily && !kitFonts.has(String(l.fontFamily).toLowerCase())) {
        offFonts.add(l.fontFamily)
      }
    }
    for (const f of offFonts) {
      rules.push({
        id: `brand-font-${f.replace(/\W+/g, '-').toLowerCase()}`,
        platform: 'general',
        severity: 'warning',
        message: `Font "${f}" isn't in the "${kit.name}" kit`,
        fix: `Brand fonts: ${kit.fonts.map(x => x.family).join(', ')}`
      })
    }
  }
  return rules
}
