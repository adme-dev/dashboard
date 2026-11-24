/** Standalone CSS colours used by native inline text, safe in a style attribute. */
export function isBannerInlineTextColor(value) {
  return typeof value === 'string' && value.length <= 80
    && /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|[a-z]+|rgba?\(\s*[\d.%]+\s*,\s*[\d.%]+\s*,\s*[\d.%]+(?:\s*,\s*[\d.%]+)?\s*\))$/i.test(value)
}

/** Bounded inline gradients; retain the source span's paint box, not the row. */
export function isBannerInlineTextGradient(value) {
  if (typeof value !== 'string' || value.length > 300) return false
  const match = /^linear-gradient\((-?\d+(?:\.\d+)?)deg,\s*(.+)\)$/.exec(value)
  if (!match || Math.abs(Number(match[1])) > 360) return false
  const stops = match[2].split(',').map(stop => /^\s*#[\da-f]{6}\s+(\d+(?:\.\d+)?)%\s*$/i.exec(stop))
  return stops.length >= 2 && stops.length <= 6 && stops.every((stop, i) => stop && Number(stop[1]) <= 100 && (!i || Number(stop[1]) >= Number(stops[i - 1]?.[1])))
}
