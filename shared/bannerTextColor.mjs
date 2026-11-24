/** Standalone CSS colours used by native inline text, safe in a style attribute. */
export function isBannerInlineTextColor(value) {
  return typeof value === 'string' && value.length <= 80
    && /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|[a-z]+|rgba?\(\s*[\d.%]+\s*,\s*[\d.%]+\s*,\s*[\d.%]+(?:\s*,\s*[\d.%]+)?\s*\))$/i.test(value)
}
