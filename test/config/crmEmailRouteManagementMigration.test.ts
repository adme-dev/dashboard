import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../server/database/migrations/326_crm_email_route_management.sql',
  import.meta.url
)

describe('CRM email route management migration', () => {
  it('adds lifecycle metadata and one-active-lead-inbox protection', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS label TEXT')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS revoked_by UUID')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS revoked_actor_type TEXT')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS revoked_reason TEXT')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS replaced_by_route_id UUID')
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_email_routes_active_lead_inbox[\s\S]*WHERE route_kind = 'lead_inbox'[\s\S]*is_active = TRUE[\s\S]*revoked_at IS NULL/)
  })

  it('stores route lifecycle audits with constrained actors and append-only records', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS crm_email_route_audits')
    expect(sql).toContain("actor_type IN ('team_member', 'client_user', 'system')")
    expect(sql).toContain('prevent_crm_email_route_audit_mutation')
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON crm_email_route_audits')
    expect(sql).toContain('crm_email_route_audits is append-only')
  })

  it('keeps plaintext bearer capabilities out of the schema', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS\s+(?:email_address|issued_address|route_token|plaintext_token)\b/i)
    expect(sql).not.toMatch(/^\s+(?:email_address|issued_address|route_token|plaintext_token)\s+\w+/im)
  })
})
