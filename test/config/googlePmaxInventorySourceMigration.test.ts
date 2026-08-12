import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/364_google_pmax_inventory_source_and_asset_mode.sql', import.meta.url),
  'utf8'
)

describe('Google PMax inventory source and asset mode migration 364', () => {
  it('adds an exact provider-backed Google feed selection', () => {
    expect(migration).toContain('\'google_feed_id\'')
    expect(migration).toContain('Provider-backed Google feed picker')
    expect(migration).toMatch(/'google_feed_id'[\s\S]*pmax_type[\s\S]*inventory[\s\S]*show/)
  })

  it('adds an explicit provided or Merchant-only asset mode', () => {
    expect(migration).toContain('\'asset_mode\'')
    expect(migration).toContain('"value":"provided"')
    expect(migration).toContain('"value":"merchant_only"')
    expect(migration).toContain('\'"provided"\'::jsonb')
  })

  it('shows manual asset fields only for provided mode', () => {
    for (const key of ['business_name', 'headlines', 'long_headlines', 'descriptions', 'images', 'logos', 'video_links']) {
      expect(migration).toContain(`'${key}'`)
    }
    expect(migration).toMatch(/UPDATE brief_template_fields field[\s\S]*asset_mode[\s\S]*provided/)
  })

  it('is transactional and idempotent', () => {
    expect(migration).toContain('BEGIN;')
    expect(migration).toContain('COMMIT;')
    expect(migration).toContain('ON CONFLICT (template_id, field_key) DO UPDATE')
  })
})
