// Pure pace/period math for ad-spend pacing. Mirrors the formulas used by the
// Ad Pacing Generator (server/utils/advisorGenerators.ts) so the figures shown
// in the recommendations UI and the anomaly/Slack surfaces match. Uses UTC date
// math against the supplied `now` — pacing is not sensitive to sub-day TZ skew,
// and this keeps the functions pure and testable.

export function periodOf(now: Date): string {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth() + 1
  return `${y}-${String(m).padStart(2, '0')}`
}

export function dayOfMonth(now: Date): number {
  return now.getUTCDate()
}

export function daysInMonth(now: Date): number {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate()
}

export function periodProgress(now: Date): number {
  return dayOfMonth(now) / daysInMonth(now)
}

export function expectedToDate(budget: number, now: Date): number {
  return budget * periodProgress(now)
}

export function projectedMonthEnd(mtdSpend: number, now: Date): number {
  const d = dayOfMonth(now)
  return d > 0 ? mtdSpend * (daysInMonth(now) / d) : 0
}
