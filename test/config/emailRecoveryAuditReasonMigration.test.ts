import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EMAIL_RECOVERY_REASONS } from '../../server/utils/leads/emailRecovery'

const canonicalMigration = readFileSync(
  new URL(
    '../../server/database/migrations/328_email_ingestion_canonical_audit_reasons.sql',
    import.meta.url
  ),
  'utf8'
)

describe('email recovery audit reason migrations', () => {
  it('keeps every recovery outcome in the final replacement constraint', () => {
    for (const reason of EMAIL_RECOVERY_REASONS) {
      expect(canonicalMigration).toContain(`'${reason}'`)
    }
  })

  it.each([
    'extraction_requires_review',
    'provider_policy_denied',
    'truthful_contact_missing',
    'canonical_outcome_invalid'
  ])('allows the canonical recovery terminal reason %s', (reason) => {
    expect(canonicalMigration).toContain(`'${reason}'`)
  })
})
