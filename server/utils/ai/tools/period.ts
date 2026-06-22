export const PERIOD_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const
export type Period = keyof typeof PERIOD_DAYS
export const periodDays = (p: Period): number => PERIOD_DAYS[p]
/** ISO timestamp `days` before `now` — the inclusive lower bound for a period window. */
export const periodSinceISO = (p: Period, now: Date = new Date()): string =>
  new Date(now.getTime() - PERIOD_DAYS[p] * 86400_000).toISOString()
