import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/267_budget_alert_tenant_isolation.sql', import.meta.url),
  'utf8'
)
const schema = readFileSync(
  new URL('../../server/database/schema-budget-alerts.sql', import.meta.url),
  'utf8'
)
const createRoute = readFileSync(
  new URL('../../server/api/agency/budget-alerts/index.post.ts', import.meta.url),
  'utf8'
)

describe('budget alert tenant isolation migration', () => {
  it('adds tenant ownership and an index for tenant-scoped active reads', () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS tenant_id TEXT/i)
    expect(migration).toMatch(/CREATE INDEX IF NOT EXISTS[^;]+budget_alerts[^;]+tenant_id[^;]+status/is)
    expect(schema).toMatch(/tenant_id TEXT NOT NULL/i)
  })

  it('backfills legacy rows only when one authoritative non-default org tenant exists', () => {
    expect(migration).toMatch(/FROM xero_org_connection/i)
    expect(migration).toMatch(/tenant_id\s*<>\s*'__default__'/i)
    expect(migration).toMatch(/HAVING COUNT\(DISTINCT tenant_id\)\s*=\s*1/i)
    expect(migration).toMatch(/WHERE ba\.tenant_id IS NULL/i)
  })

  it('requires the authenticated app authority to stamp new alerts with its tenant', () => {
    expect(createRoute).toContain('resolveUserPlatformAgentAuthority')
    expect(createRoute).toMatch(/INSERT INTO budget_alerts\s*\([\s\S]*tenant_id/i)
    expect(createRoute).toContain('authority.tenantId')
  })
})
