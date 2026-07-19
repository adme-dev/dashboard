import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/266_google_credential_profiles.sql', import.meta.url),
  'utf8'
)

describe('Google credential profiles migration 266', () => {
  it('adds independent credential profiles and one-time OAuth attempts', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS google_credential_profiles')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS google_oauth_attempts')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS google_credential_profile_accounts')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS google_credential_profile_id')
  })

  it('stores encrypted credential material without plaintext profile token columns', () => {
    expect(migration).toContain('access_token_encrypted BYTEA NOT NULL')
    expect(migration).toContain('access_token_iv BYTEA NOT NULL')
    expect(migration).toContain('refresh_token_encrypted BYTEA')
    expect(migration).toContain('refresh_token_iv BYTEA')
    expect(migration).not.toMatch(/^\s*(access_token|refresh_token)\s+TEXT/im)
  })

  it('supports overlapping account discovery while retaining one active profile', () => {
    expect(migration).toContain('PRIMARY KEY (profile_id, connection_id)')
    expect(migration).toContain('manager_customer_id TEXT')
    expect(migration).toMatch(/google_credential_profile_id UUID[\s\S]*REFERENCES google_credential_profiles\(id\)/)
  })

  it('enforces hashed, expiring, one-time OAuth state', () => {
    expect(migration).toContain('state_digest CHAR(64) NOT NULL UNIQUE')
    expect(migration).toContain('expires_at TIMESTAMPTZ NOT NULL')
    expect(migration).toContain('consumed_at TIMESTAMPTZ')
    expect(migration).toContain('CHECK (expires_at > created_at)')
    expect(migration).toContain('idx_google_oauth_attempts_pending')
  })

  it('keeps rollout additive and rollback-safe', () => {
    expect(migration).toContain('IF NOT EXISTS')
    expect(migration).toContain('Rollback guidance: leave these additive structures in place')
    expect(migration).not.toMatch(/^\s*DROP\s+/im)
  })
})
