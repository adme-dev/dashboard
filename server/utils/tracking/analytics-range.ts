/** Parse + validate a from/to date query for analytics endpoints. Pure (clock
 *  injectable for tests). Returns the LOCAL day strings ('YYYY-MM-DD'); the
 *  endpoints turn these into client-tz UTC bounds via analytics-window.WINDOW_SQL. */
export interface ParsedRange { fromDate: string, toDate: string }

const DAY = 86_400_000

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function parseRange(
  q: { from?: string, to?: string },
  now: () => Date = () => new Date()
): ParsedRange {
  const today = now()
  const to = q.to
    ? new Date(q.to + 'T00:00:00Z')
    : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const from = q.from ? new Date(q.from + 'T00:00:00Z') : new Date(to.getTime() - 29 * DAY)
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid from/to date' })
  }
  if (from.getTime() > to.getTime()) {
    throw createError({ statusCode: 400, statusMessage: 'from must be <= to' })
  }
  if (to.getTime() - from.getTime() > 366 * DAY) {
    throw createError({ statusCode: 400, statusMessage: 'Range too large (max 366 days)' })
  }
  return { fromDate: ymd(from), toDate: ymd(to) }
}
