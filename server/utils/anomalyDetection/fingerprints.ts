import type { AnomalyType } from './types'

const MAX_SUBKEY_LEN = 80

/**
 * Stable, slug-safe identifier for an anomaly across detection runs.
 * Active rows are deduped on (tenant_id, fingerprint) — see migration 088.
 */
export function buildFingerprint(type: AnomalyType, subKey: string): string {
  const slug = subKey
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, MAX_SUBKEY_LEN)
  return `${type}:${slug}`
}
