/** CSS order is clockwise from the top left. Validate saved canvas values before emitting CSS. */
export function bannerCornerRadii(values: unknown): string | undefined {
  if (!Array.isArray(values) || values.length !== 4 || !values.every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100000)) return
  return values.map(value => `${value}px`).join(' ')
}
