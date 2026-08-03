import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/340_search_authority_google_business_performance.sql', import.meta.url),
  'utf8'
)

describe('Search Authority Google Business performance migration', () => {
  it('stores only bounded, dated, tenant-scoped provider facts', () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS search_authority_google_business_metrics/i)
    expect(migration).toMatch(/metric_date DATE NOT NULL/i)
    expect(migration).toMatch(/metric_value BIGINT NOT NULL CHECK \(metric_value >= 0\)/i)
    expect(migration).toMatch(/UNIQUE \(social_account_id, metric_name, metric_date\)/i)
    expect(migration).toMatch(/FOREIGN KEY \(client_id, social_account_id\)[\s\S]*REFERENCES social_accounts\(client_id, id\)/i)
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS search_authority_google_business_sync_runs/i)
    expect(migration).toMatch(/reason_code/i)
    expect(migration).not.toMatch(/raw_payload|access_token|refresh_token/i)
  })
})
