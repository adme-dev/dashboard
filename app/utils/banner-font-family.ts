/** A font family is a CSS string: imported aliases may contain numeric hash tokens. */
export function bannerFontFamily(value?: string): string {
  const family = (value || 'Barlow Condensed').replace(/\\/g, '\\\\').replace(/'/g, '\\\'').replace(/[\r\n\f]/g, ' ')
  return `'${family}',sans-serif`
}
