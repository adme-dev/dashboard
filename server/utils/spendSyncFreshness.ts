export const SPEND_BUDGET_ACTION_SYNC_STALE_HOURS = 48

export function spendSyncAgeHours(syncedAt: string | null | undefined, now = new Date()): number {
  if (!syncedAt) return Infinity
  const parsed = new Date(syncedAt)
  if (Number.isNaN(parsed.getTime())) return Infinity
  return (now.getTime() - parsed.getTime()) / 3_600_000
}

export function isSpendSyncStale(
  syncedAt: string | null | undefined,
  now = new Date(),
  staleAfterHours = SPEND_BUDGET_ACTION_SYNC_STALE_HOURS,
): boolean {
  return spendSyncAgeHours(syncedAt, now) >= staleAfterHours
}
