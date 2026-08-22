import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = 'server/database/migrations/338_xero_tracking_tenant_scope.sql'
const migrationExists = existsSync(migrationPath)
const sql = migrationExists ? readFileSync(migrationPath, 'utf8') : ''
const compactSql = sql.replace(/\s+/g, ' ').trim()

describe('Xero tracking tenant-scope migration', () => {
  it('adds nullable ownership and an idempotent tenant/name lookup index', () => {
    expect(migrationExists).toBe(true)
    expect(compactSql).toContain('ALTER TABLE xero_tracking_categories ADD COLUMN IF NOT EXISTS tenant_id TEXT')
    expect(compactSql).toContain('CREATE INDEX IF NOT EXISTS idx_xero_tracking_categories_tenant_name')
    expect(compactSql).toContain('ON xero_tracking_categories (tenant_id, LOWER(name))')
    expect(compactSql).not.toContain('tenant_id TEXT NOT NULL')
  })

  it('backfills only one unambiguous non-placeholder Xero tenant', () => {
    expect(compactSql).toContain('FROM xero_org_connection')
    expect(compactSql).toContain("WHERE tenant_id <> '__default__'")
    expect(compactSql).toContain('HAVING COUNT(DISTINCT tenant_id) = 1')
    expect(compactSql).toContain('WHERE category.tenant_id IS NULL')
    expect(compactSql).toContain('NULL is legacy/unclassified and must fail closed')
  })
})
