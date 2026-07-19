/**
 * Pure connection-health classifier.
 *
 * Used by /api/agency/social/connections (per-row) and the new
 * /api/agency/social/connections/health-summary (aggregate).
 *
 * Health rules (priority order — first match wins):
 *   1. error          — status != 'active'
 *   2. expired        — tokenExpiresAt is in the past and cannot refresh
 *   3. expiring_soon  — tokenExpiresAt within 7 days AND no refreshToken
 *                       (Google's tokens auto-refresh — skip the warning)
 *   4. never_synced   — lastSyncedAt is null
 *   5. stale_sync     — lastSyncedAt older than 24h
 *   6. healthy        — otherwise
 */
export type ConnectionHealth =
  | 'healthy'
  | 'expiring_soon'
  | 'expired'
  | 'stale_sync'
  | 'never_synced'
  | 'error'

export interface ClassifyInput {
  status: string
  tokenExpiresAt: Date | string | null | undefined
  refreshToken: string | null | undefined
  lastSyncedAt: Date | string | null | undefined
  now?: Date  // override for tests
}

export interface ClassifyResult {
  health: ConnectionHealth
  daysUntilExpiry: number | null
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const ONE_DAY_MS = 24 * 60 * 60 * 1000

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null
  return v instanceof Date ? v : new Date(v)
}

export function classifyConnectionHealth(input: ClassifyInput): ClassifyResult {
  const now = input.now ?? new Date()
  const tokenExpiresAt = toDate(input.tokenExpiresAt)
  const lastSyncedAt = toDate(input.lastSyncedAt)
  const daysUntilExpiry = tokenExpiresAt
    ? Math.floor((tokenExpiresAt.getTime() - now.getTime()) / ONE_DAY_MS)
    : null

  if (input.status !== 'active') {
    return { health: 'error', daysUntilExpiry }
  }
  if (tokenExpiresAt && tokenExpiresAt.getTime() < now.getTime() && !input.refreshToken) {
    return { health: 'expired', daysUntilExpiry }
  }
  if (
    tokenExpiresAt
    && tokenExpiresAt.getTime() - now.getTime() < SEVEN_DAYS_MS
    && !input.refreshToken
  ) {
    return { health: 'expiring_soon', daysUntilExpiry }
  }
  if (!lastSyncedAt) {
    return { health: 'never_synced', daysUntilExpiry }
  }
  if (now.getTime() - lastSyncedAt.getTime() > ONE_DAY_MS) {
    return { health: 'stale_sync', daysUntilExpiry }
  }
  return { health: 'healthy', daysUntilExpiry }
}
