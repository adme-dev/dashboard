// The inspector accepts a bare pixel distance as well as an explicit CSS unit.
export function bannerLetterSpacing(value?: string | number, fallback = 'normal'): string {
  const spacing = String(value ?? '').trim()
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(spacing)) return Number(spacing) === 0 ? '0' : spacing + 'px'
  return spacing || fallback
}
