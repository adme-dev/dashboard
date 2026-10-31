import type { BannerBrandKit, BannerProject } from '~/types/banner-studio'

const words = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()
const contains = (value: string, phrase: string) => !!phrase && ` ${words(value)} `.includes(` ${phrase} `)
function aliases(kit: BannerBrandKit) {
  const brand = kit.sourceUrl?.match(/#brand=([a-z0-9_-]+)/i)?.[1]
  const name = words(kit.name).replace(/\b(australia|australian|auto|motor|motors)\b/g, '').replace(/\s+/g, ' ').trim()
  return [...new Set([brand && words(brand), name].filter((name): name is string => !!name && name.length >= 2))]
}

/** Select only an unambiguous kit; matching never changes campaign artwork. */
export function detectBannerBrandKit(project: BannerProject | null | undefined, kits: BannerBrandKit[]): BannerBrandKit | undefined {
  if (!project) return
  const explicit = (project.tags || []).find(tag => tag.startsWith('brand-kit:'))?.slice('brand-kit:'.length)
  if (explicit) return kits.find(kit => kit.id === explicit && (!kit.clientId || kit.clientId === project.clientId))
  const clientDefaults = kits.filter(kit => kit.clientId === project.clientId && kit.clientId && kit.isDefault)
  if (clientDefaults.length === 1) return clientDefaults[0]
  const accessible = kits.filter(kit => !kit.clientId || kit.clientId === project.clientId)
  // Project branding is more specific than a multi-franchise dealer's name.
  for (const context of [project.name || '', project.clientName || '']) {
    const matches = accessible.filter(kit => aliases(kit).some(alias => contains(context, alias)))
    if (matches.length === 1) return matches[0]
    if (matches.length > 1) return
  }
  // Exact managed font IDs can identify a kit without relying on a generic family name.
  const used = new Set(Object.values(project.canvasData || {}).flatMap(board => board.layers.map(layer => layer.fontAssetId).filter(Boolean)))
  const matches = accessible.filter(kit => kit.fonts.some(font => font.assets?.some(asset => used.has(asset.id))))
  if (matches.length === 1) return matches[0]
}
