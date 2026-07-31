import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL(
    '../../server/database/migrations/327_email_ingestion_recovery_audit_reasons.sql',
    import.meta.url
  ),
  'utf8'
)

describe('email recovery audit reason migration 327', () => {
  it('allows every recovery outcome that can be committed atomically', () => {
    for (const reason of [
      'missing_evidence',
      'corrupt_evidence',
      'content_mismatch',
      'identity_mismatch',
      'parse_failed',
      'endpoint_unavailable',
      'capture_mode_ineligible',
      'sender_policy_denied',
      'attempts_exhausted',
      'evidence_expired',
      'legacy_evidence',
      'canonical_window_elapsed',
      'canonical_transient',
      'lease_lost'
    ]) {
      expect(migration).toContain(`'${reason}'`)
    }
  })
})
