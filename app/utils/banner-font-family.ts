import { bannerFontFamily as resolvedFamily } from '~~/shared/banner/fonts'

/** A font family is a CSS string: imported aliases may contain numeric hash tokens. */
export function bannerFontFamily(value?: string, fontAssetId?: string): string {
  const family = resolvedFamily(value, fontAssetId).replace(/\\/g, '\\\\').replace(/'/g, '\\\'').replace(/[\r\n\f]/g, ' ')
  return `'${family}',sans-serif`
}
