import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EMAIL_RECOVERY_REASONS } from '../../server/utils/leads/emailRecovery'

const migration = readFileSync(
  new URL(
    '../../server/database/migrations/327_email_ingestion_recovery_audit_reasons.sql',
    import.meta.url
  ),
  'utf8'
)

describe('email recovery audit reason migration 327', () => {
  it('allows every recovery outcome that can be committed atomically', () => {
    for (const reason of EMAIL_RECOVERY_REASONS) {
      expect(migration).toContain(`'${reason}'`)
    }
  })
})
