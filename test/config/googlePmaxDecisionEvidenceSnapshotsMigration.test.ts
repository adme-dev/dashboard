import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/357_google_pmax_decision_evidence_snapshots.sql', import.meta.url),
  'utf8'
)

describe('Google PMax evidence snapshots migration 357', () => {
  it('creates immutable, config-bound, deduplicated snapshots', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS campaign_launch_evidence_snapshots')
    expect(migration).toContain('REFERENCES campaign_launches (id, config_version, config_hash)')
    expect(migration).toContain('UNIQUE (launch_id, config_version, config_hash, evidence_hash)')
    expect(migration).toContain('prevent_campaign_launch_ledger_mutation')
  })

  it('fails closed on oversized or sensitive evidence', () => {
    expect(migration).toContain('octet_length(snapshot::text) <= 262144')
    expect(migration).toContain('NOT campaign_launch_payload_has_sensitive_keys(snapshot)')
  })

  it('is additive and transactional', () => {
    expect(migration).toContain('IF NOT EXISTS')
    expect(migration).toContain('BEGIN;')
    expect(migration).toContain('COMMIT;')
    expect(migration).not.toMatch(/DROP TABLE|DELETE FROM/i)
  })
})
