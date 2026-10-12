/** Missing provider measurements are different from measured zeroes. */
export function formatSocialMetric(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return value.toLocaleString('en-AU')
}

export function formatSocialRate(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : `${value}%`
}
