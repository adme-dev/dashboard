import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(resolve(
  process.cwd(),
  'server/database/migrations/359_google_pmax_onboarding_attestations.sql'
), 'utf8')

describe('Google PMax onboarding attestation migration', () => {
  it('binds immutable evidence to one exact launch config and expiry window', () => {
    expect(sql).toContain('campaign_launch_onboarding_attestations')
    expect(sql).toMatch(/FOREIGN KEY \(launch_id, config_version, config_hash\)/)
    expect(sql).toContain(`snapshot#>>'{identity,configHash}' = config_hash`)
    expect(sql).toContain('expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > attested_at)')
    expect(sql).toContain('prevent_campaign_launch_ledger_mutation()')
    expect(sql).toContain('campaign_launch_payload_has_sensitive_keys(snapshot)')
  })
})
