import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The test harness runs against a fake localhost DATABASE_URL (see test/setup.ts),
// so we cannot assert against information_schema live. Instead we assert the migration
// files declare the columns the publishing code depends on. The migrations themselves
// are run + verified against Neon via psql at build time (per CLAUDE.md).
const mig = (f: string) =>
  readFileSync(resolve(__dirname, '../../server/database/migrations', f), 'utf8')

describe('social publishing migrations', () => {
  it('144 social_accounts declares client scope + token columns', () => {
    const sql = mig('144_social_accounts.sql')
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS social_accounts/)
    for (const col of ['client_id', 'platform', 'platform_account_id', 'access_token', 'refresh_token', 'is_active']) {
      expect(sql).toContain(col)
    }
    expect(sql).toMatch(/UNIQUE \(platform, platform_account_id\)/)
  })

  it('145 social_posts declares platform_overrides + tags + queue + result columns', () => {
    const sql = mig('145_social_posts.sql')
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS social_posts/)
    for (const col of ['platform_overrides', 'tags', 'platform_results', 'queue_position', 'publish_attempts']) {
      expect(sql).toContain(col)
    }
    // status check constraint covers the full lifecycle
    for (const status of ['draft', 'approved', 'scheduled', 'publishing', 'published', 'partially_published', 'failed', 'cancelled']) {
      expect(sql).toContain(`'${status}'`)
    }
  })

  it('146 social_support declares slot schedules + templates + metrics', () => {
    const sql = mig('146_social_support.sql')
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS social_slot_schedules/)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS social_post_templates/)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS social_post_metrics/)
    for (const col of ['day_of_week', 'time_of_day', 'capacity', 'enabled']) {
      expect(sql).toContain(col)
    }
  })
})
