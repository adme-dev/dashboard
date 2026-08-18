export type DataStatus = 'populated' | 'partial' | 'not_configured' | 'unavailable'

export interface DataHealth {
  dataStatus: DataStatus
  coverage: { expected: number, withData: number }
}

export function buildDataHealth(input: {
  configured: boolean
  available?: boolean
  expected: number
  withData: number
}): DataHealth {
  const expected = Math.max(0, Math.trunc(input.expected))
  const withData = Math.min(expected, Math.max(0, Math.trunc(input.withData)))
  const dataStatus: DataStatus = input.available === false
    ? 'unavailable'
    : !input.configured
      ? 'not_configured'
      : expected > 0 && withData < expected
        ? 'partial'
        : 'populated'

  return { dataStatus, coverage: { expected, withData } }
}

const CURSOR_PREFIX = 'xf1_'

export function cursorOffset(cursor?: string): number {
  if (!cursor) return 0
  if (!cursor.startsWith(CURSOR_PREFIX)) throw new Error('Invalid pagination cursor.')
  const value = Number.parseInt(cursor.slice(CURSOR_PREFIX.length), 36)
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid pagination cursor.')
  return value
}

export function cursorForOffset(offset: number): string | null {
  return offset > 0 ? `${CURSOR_PREFIX}${Math.trunc(offset).toString(36)}` : null
}

export function paginateWithCursor<T>(rows: T[], cursor?: string, limit = 20): {
  items: T[]
  nextCursor: string | null
  total: number
  more: number
} {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100)
  const offset = cursorOffset(cursor)
  const items = rows.slice(offset, offset + safeLimit)
  const nextOffset = offset + items.length
  const remaining = Math.max(0, rows.length - nextOffset)
  return {
    items,
    nextCursor: remaining > 0 ? cursorForOffset(nextOffset) : null,
    total: rows.length,
    more: remaining,
  }
}
