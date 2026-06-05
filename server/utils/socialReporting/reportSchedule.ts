// server/utils/socialReporting/reportSchedule.ts
// Pure cadence logic for scheduled report exports (3c). Decides whether a schedule is due to send,
// independent of the DB/cron — so it's fully unit-testable.

export interface ReportScheduleRow {
  id: string
  client_id: string
  cadence: string // 'weekly' | 'monthly'
  enabled: boolean
  last_sent_at: string | null
}

/** Minimum days between sends for each cadence. */
export function cadenceMinDays(cadence: string): number {
  return cadence === 'weekly' ? 7 : 28
}

/**
 * True if a schedule should send now: enabled, and either never sent or enough time has elapsed
 * since the last send for its cadence. `now` is injected (no Date.now()) for deterministic tests.
 */
export function isSocialReportDue(s: ReportScheduleRow, now: Date): boolean {
  if (!s.enabled) return false
  if (!s.last_sent_at) return true
  const last = new Date(s.last_sent_at)
  if (Number.isNaN(last.getTime())) return true
  const elapsedDays = (now.getTime() - last.getTime()) / 86400_000
  return elapsedDays >= cadenceMinDays(s.cadence)
}
