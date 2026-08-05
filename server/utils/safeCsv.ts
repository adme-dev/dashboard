const FORMULA_PREFIX = /^[=+\-@\t\r]/

export function safeCsvCell(value: unknown): string {
  if (value == null) return ''
  const raw = String(value)
  const neutralized = FORMULA_PREFIX.test(raw) ? `'${raw}` : raw
  return /[",\n\r]/.test(neutralized)
    ? `"${neutralized.replace(/"/g, '""')}"`
    : neutralized
}

export function serializeSafeCsv(
  headers: string[],
  rows: unknown[][],
): string {
  return [
    headers.map(safeCsvCell).join(','),
    ...rows.map(row => row.map(safeCsvCell).join(',')),
  ].join('\r\n')
}
