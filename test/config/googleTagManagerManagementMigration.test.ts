import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  resolve(process.cwd(), 'server/database/migrations/337_google_tag_manager_management.sql'),
  'utf8',
)

describe('Google Tag Manager management migration', () => {
  it('stores OAuth credentials by encrypted profile reference rather than plaintext', () => {
    expect(sql).toContain('google_credential_profile_id UUID NOT NULL')
    expect(sql).not.toMatch(/gtm_connections[\s\S]{0,800}\baccess_token\b/i)
    expect(sql).not.toMatch(/gtm_connections[\s\S]{0,800}\brefresh_token\b/i)
  })

  it('binds one exact canonical GTM web container to each tracking site', () => {
    expect(sql).toContain('tracking_site_id UUID NOT NULL UNIQUE')
    expect(sql).toContain("container_path ~ '^accounts/[0-9]+/containers/[0-9]+$'")
    expect(sql).toContain("container_public_id ~ '^GTM-[A-Z0-9]+$'")
  })

  it('supports guarded lifecycle, rollback evidence, and concurrent install dedupe', () => {
    expect(sql).toContain("'planned', 'executing', 'drafted', 'versioned', 'published', 'verified'")
    expect(sql).toContain('previous_live_version_path TEXT')
    expect(sql).toContain('previous_live_version_fingerprint TEXT')
    expect(sql).toContain('idx_gtm_change_sets_active_install')
  })

  it('adds a shared project quota window', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS gtm_api_quota_windows')
    expect(sql).toContain('request_count INTEGER NOT NULL DEFAULT 0')
  })
})
