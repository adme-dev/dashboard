import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('tracking provider settings migration', () => {
  const sql = readFileSync(resolve(
    __dirname,
    '../../server/database/migrations/276_tracking_provider_settings.sql'
  ), 'utf8')

  it('persists Podium and Xtime interaction and confirmed-lead controls', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS provider_tracking JSONB/)
    expect(sql).toMatch(/"podium".*"interactions".*"confirmedLeads"/s)
    expect(sql).toMatch(/"xtime".*"interactions".*"confirmedLeads"/s)
    expect(sql).toMatch(/tracking_sites_provider_tracking_shape/)
  })
})
