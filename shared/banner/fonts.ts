/** Stable CSS identity keeps equal family names from different uploads independent. */
export function bannerFontFamily(family?: string, fontAssetId?: string): string {
  if (fontAssetId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fontAssetId)) {
    return `XeroFlowFont_${fontAssetId.toLowerCase().replace(/-/g, '')}`
  }
  return family || 'Barlow Condensed'
}

/** Parse font metadata from TEXT[] tags */
export function parseBannerFontTags(tags: readonly string[]): { weight: number, format: string } {
  let weight = 400
  let format = 'woff2'
  if (!Array.isArray(tags)) return { weight, format }
  for (const tag of tags) {
    if (tag.startsWith('weight:')) weight = parseInt(tag.slice(7)) || 400
    if (tag.startsWith('format:')) format = tag.slice(7) || 'woff2'
  }
  // Validate format
  if (!['woff2', 'woff', 'truetype', 'opentype'].includes(format)) format = 'woff2'
  return { weight, format }
}

/** CSS Fonts weight matching, including the special search order between 400 and 500. */
export function matchingBannerFontWeight(available: readonly number[], requested = 400): number | undefined {
  const weights = [...new Set(available)].sort((a, b) => a - b)
  if (requested >= 400 && requested <= 500) {
    return weights.find(weight => weight >= requested && weight <= 500)
      ?? weights.filter(weight => weight < requested).at(-1)
      ?? weights.find(weight => weight > 500)
  }
  return requested < 400
    ? weights.filter(weight => weight <= requested).at(-1) ?? weights.find(weight => weight > requested)
    : weights.find(weight => weight >= requested) ?? weights.filter(weight => weight < requested).at(-1)
}
