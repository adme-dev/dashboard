import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/369_google_pmax_decision_evidence_identity_check.sql', import.meta.url),
  'utf8'
)

describe('Google PMax evidence identity migration 369', () => {
  it('requires JSON and indexed snapshot identities to agree', () => {
    expect(migration).toContain('snapshot->>\'evidenceHash\' = evidence_hash')
    expect(migration).toContain('snapshot#>>\'{identity,configVersion}\' = config_version::text')
    expect(migration).toContain('snapshot#>>\'{identity,configHash}\' = config_hash')
  })

  it('adds the constraint idempotently and transactionally', () => {
    expect(migration).toContain('IF NOT EXISTS')
    expect(migration).toContain('BEGIN;')
    expect(migration).toContain('COMMIT;')
  })
})
