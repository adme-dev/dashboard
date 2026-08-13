import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/335_meta_catalog_feed_bindings.sql', import.meta.url),
  'utf8'
)

describe('Meta catalogue feed binding migration', () => {
  it('binds each source feed to an exact tenant-owned Meta connection and provider identities', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS meta_catalog_feed_bindings')
    expect(migration).toMatch(/FOREIGN KEY \(client_id, connection_id\)[\s\S]*REFERENCES social_connections \(client_id, id\)/)
    expect(migration).toMatch(/UNIQUE \(client_id, connection_id, source_feed_id\)/)
    expect(migration).toContain('product_catalog_id')
    expect(migration).toContain('product_feed_id')
    expect(migration).toContain('latest_upload_id')
    expect(migration).toMatch(/CHECK \(state IN \('pending', 'ready', 'blocked'\)\)/)
  })

  it('stores sanitized readback evidence and protects the append-only audit ledger', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS meta_catalog_feed_audit_events')
    expect(migration).toContain('evidence JSONB')
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION reject_meta_catalog_feed_audit_mutation/)
    expect(migration).toMatch(/BEFORE UPDATE OR DELETE ON meta_catalog_feed_audit_events/)
    expect(migration).toContain('Meta catalogue feed audit is append-only')
  })

  it('uses expiring, one-time OAuth attempts instead of a shared callback cookie', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS meta_oauth_attempts')
    expect(migration).toContain('state_digest CHAR(64) NOT NULL UNIQUE')
    expect(migration).toMatch(/intent TEXT NOT NULL CHECK \(intent IN \('connection', 'catalog_management'\)\)/)
    expect(migration).toContain('consumed_at TIMESTAMPTZ')
  })
})
