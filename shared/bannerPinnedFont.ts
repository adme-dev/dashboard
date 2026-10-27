/** Unmodified Adobe Source Sans 3.052R static Bold. Kept identical to the Linux bridge. */
export const BANNER_PINNED_FONT = Object.freeze({
  family: 'Source Sans 3',
  weight: 700,
  style: 'normal',
  postscriptName: 'SourceSans3-Bold',
  version: '3.052',
  sha256: '9214b9d95e4231c609802815c2646c98174e2102d0d37f88978a7f8e71006e6a',
  byteLength: 428176,
  url: '/fonts/banner/SourceSans3-Bold.9214b9d95e4231c609802815c2646c98174e2102d0d37f88978a7f8e71006e6a.ttf',
  licenseUrl: '/fonts/banner/OFL-SourceSans3.89ad2c4f66dd29127527493e729c31e731f111cf10faf5774c3db9275ed0c22c.md',
  licenseSha256: '89ad2c4f66dd29127527493e729c31e731f111cf10faf5774c3db9275ed0c22c',
  sourceCommit: 'ed1808970eb3c7301c9a523bee26473ba0bb62fa'
} as const)

/** CSS family identity is case-insensitive; uploaded aliases must not shadow this face. */
export function isBannerPinnedFamily(family?: string): boolean {
  return family?.trim().replace(/^(['"])(.*)\1$/, '$2').toLowerCase() === BANNER_PINNED_FONT.family.toLowerCase()
}

export function isBannerPinnedFace(family?: string, weight: number = 400): boolean {
  return isBannerPinnedFamily(family) && weight === BANNER_PINNED_FONT.weight
}

export function bannerPinnedFontUrl(origin?: string): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : undefined)
  return base && /^https?:\/\//.test(base) ? new URL(BANNER_PINNED_FONT.url, base).href : BANNER_PINNED_FONT.url
}

export function bannerPinnedFontCss(layers: Array<{ fontFamily?: string, fontWeight?: number }>, origin?: string): string {
  if (!layers.some(layer => isBannerPinnedFace(layer.fontFamily, layer.fontWeight))) return ''
  // URL is derived solely from the fixed asset and a trusted application origin.
  const url = bannerPinnedFontUrl(origin).replace(/['"<>\\\r\n]/g, char => encodeURIComponent(char))
  return `@font-face { font-family: '${BANNER_PINNED_FONT.family}'; src: url('${url}') format('truetype'); font-weight: 700; font-style: normal; font-display: block; }`
}
