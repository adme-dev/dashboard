// server/utils/crm/documents.ts
// F13 — pure helpers for document expiry (drives the UI badge). Storage + DB live
// in documentsDb.ts; R2 access reuses server/utils/storage.ts.

export type DocTarget = 'person' | 'company' | 'opportunity'
export type ExpiryStatus = 'none' | 'active' | 'expiring' | 'expired'

const DAY = 24 * 60 * 60 * 1000

/** Classify a document's expiry relative to `nowMs` (default window: 7 days). */
export function expiryStatus(expiresAt: string | null | undefined, nowMs: number, windowDays = 7): ExpiryStatus {
  if (!expiresAt) return 'none'
  const t = Date.parse(expiresAt)
  if (Number.isNaN(t)) return 'none'
  if (t <= nowMs) return 'expired'
  if (t - nowMs <= windowDays * DAY) return 'expiring'
  return 'active'
}

export function isExpired(expiresAt: string | null | undefined, nowMs: number): boolean {
  return expiryStatus(expiresAt, nowMs) === 'expired'
}
