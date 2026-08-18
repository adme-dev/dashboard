import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Google Ads call reporting migration', () => {
  it('creates idempotent call and sync-health storage with provider-local timestamps', () => {
    const sql = readFileSync('server/database/migrations/335_google_ads_call_reporting.sql', 'utf8')

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS google_ads_calls')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS google_ads_call_sync_state')
    expect(sql).toContain('started_at TIMESTAMP WITHOUT TIME ZONE NOT NULL')
    expect(sql).toContain('customer_timezone TEXT')
    expect(sql).toContain("status IN ('MISSED', 'RECEIVED', 'UNKNOWN', 'UNSPECIFIED')")
    expect(sql).toContain('duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0)')
    expect(sql).toContain('UNIQUE (connection_id, provider_call_id)')
    expect((sql.match(/CREATE INDEX IF NOT EXISTS/g) || [])).toHaveLength(4)
  })
})
