import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('server/database/migrations/398_ad_delivery_diagnostics.sql', 'utf8')

describe('migration 398 — platform delivery diagnostics', () => {
  it('adds independent ad and campaign diagnostic families', () => {
    for (const field of [
      'approval_synced_at',
      'learning_stage_synced_at',
      'ad_set_metrics_synced_at',
      'serving_status_synced_at',
      'impression_share_synced_at',
    ]) expect(sql).toContain(field)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS policy_issues JSONB/i)
    expect(sql).toMatch(/provider_serving_status_reasons TEXT\[\]/i)
  })

  it('represents search-term sync state separately from bounded child rows', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS campaign_search_term_syncs/i)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS campaign_search_term_snapshots/i)
    expect(sql).toMatch(/last_attempted_at TIMESTAMPTZ/i)
    expect(sql).toMatch(/truncated_at_source BOOLEAN/i)
    expect(sql).toMatch(/REFERENCES campaign_search_term_syncs\(id\) ON DELETE CASCADE/i)
  })
})
