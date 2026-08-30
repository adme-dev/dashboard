import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../server/database/migrations/402_page_studio_control_plane.sql',
  import.meta.url
)

describe('Page Studio control-plane migration', () => {
  it('creates every authoritative scoped record required by the cross-repository contract', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const tables = [
      'page_studio_entitlements',
      'page_studio_sites',
      'page_studio_site_memberships',
      'page_studio_checkpoints',
      'page_studio_versions',
      'page_studio_reviews',
      'page_studio_builds',
      'page_studio_releases',
      'page_studio_release_pointers',
      'page_studio_audit_events',
      'page_studio_domains',
      'page_studio_assets'
    ]

    for (const table of tables) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i'))
    }
  })

  it('enforces scoped ownership, immutable approvals, route uniqueness, and active release lookup', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toMatch(/UNIQUE\s*\(tenant_id,\s*route\)/i)
    expect(sql).toMatch(/UNIQUE\s*\(tenant_id,\s*client_id,\s*id\)/i)
    expect(sql).toMatch(/FOREIGN KEY\s*\(tenant_id,\s*client_id,\s*site_id\)/i)
    expect(sql).toMatch(/version_digest\s+CHAR\(64\)\s+NOT NULL/i)
    expect(sql).toMatch(/page_studio_reviews_append_only/i)
    expect(sql).toMatch(/page_studio_audit_events_append_only/i)
    expect(sql).toMatch(/page_studio_release_pointers\s*\(normalized_hostname\)/i)
  })

  it('seeds Page Studio groups for existing system roles without widening viewer access', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('\'PAGE_STUDIO_VIEW\'')
    expect(sql).toContain('\'PAGE_STUDIO_SUBSCRIPTIONS\'')
    expect(sql).toMatch(/WHERE\s+cr\.slug\s+IN\s*\('owner',\s*'admin'/i)
    expect(sql).not.toMatch(/WHERE\s+cr\.slug\s+IN\s*\([^)]*'viewer'/i)
  })
})
