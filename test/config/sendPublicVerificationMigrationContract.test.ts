import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/272_send_public_verifications.sql', import.meta.url),
  'utf8'
)

describe('Send public verification migration 272', () => {
  it('creates one transfer-scoped, expiring, single-use challenge', () => {
    expect(migration).toContain('BEGIN;')
    expect(migration).toContain('COMMIT;')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS send_public_verifications')
    expect(migration).toContain('transfer_id UUID NOT NULL UNIQUE')
    expect(migration).toContain('public_sender_id UUID NOT NULL')
    expect(migration).toContain('verification_expires_at TIMESTAMPTZ NOT NULL')
    expect(migration).toContain('verification_consumed_at TIMESTAMPTZ')
    expect(migration).toContain('idx_send_public_verifications_expiry')
  })

  it('persists only a 256-bit token hash and no raw link capability', () => {
    expect(migration).toContain('token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ \'^[a-f0-9]{64}$\')')
    expect(migration).not.toMatch(/^\s*(token|verification_token|management_token|share_token)\s+/im)
    expect(migration).not.toMatch(/^\s*(signed_url|public_url|presigned_url)\s+/im)
  })
})
