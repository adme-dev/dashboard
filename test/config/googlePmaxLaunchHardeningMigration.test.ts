import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL('../../server/database/migrations/351_google_pmax_launch_foundation.sql', import.meta.url)

describe('Google PMax launch hardening migration', () => {
  it('persists and constrains the retry execution phase', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('retry_from_state TEXT')
    expect(sql).toContain('retry_from_state IN (\'EXECUTING\', \'ENABLING\')')
    expect(sql).toContain('state = \'FAILED_RETRYABLE\'')
  })

  it('rejects sensitive audit keys at the database boundary', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('campaign_launch_payload_has_sensitive_keys')
    expect(sql).toContain('jsonb_each')
    expect(sql).toContain('jsonb_array_elements')
    expect(sql).toContain('NOT campaign_launch_payload_has_sensitive_keys(payload)')
  })

  it('requires approval evidence for approval states and blocks ledger truncation', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('enforce_campaign_launch_approval_state')
    expect(sql).toContain('approval_kind = \'create\'')
    expect(sql).toContain('approval_kind = \'activate\'')
    expect(sql).toContain('TG_OP = \'INSERT\'')
    expect(sql).toContain('BEFORE INSERT OR UPDATE OF state ON campaign_launches')
    expect(sql).toContain('BEFORE TRUNCATE')
    expect(sql).toContain('FOR EACH STATEMENT')
  })
})
