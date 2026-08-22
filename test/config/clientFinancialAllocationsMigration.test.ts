import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('server/database/migrations/337_client_financial_allocations.sql', 'utf8')
const compactSql = sql.replace(/\s+/g, ' ').trim()

describe('client financial allocation migration', () => {
  it('creates durable one-to-one mappings and append-only audit storage', () => {
    expect(compactSql).toContain('CREATE TABLE IF NOT EXISTS agency_client_xero_tracking_mappings')
    expect(compactSql).toContain('PRIMARY KEY (tenant_id, client_id)')
    expect(compactSql).toContain('CREATE TABLE IF NOT EXISTS xero_project_allocations')
    expect(compactSql).toContain('PRIMARY KEY (tenant_id, line_item_id)')
    expect(compactSql).toContain('CREATE TABLE IF NOT EXISTS financial_allocation_audit')
    expect(compactSql).toContain("CHECK (source_type IN ('media_spend', 'xero_line', 'client_tracking'))")
    expect(sql).not.toContain('REFERENCES xero_invoice_lines_cache')
  })

  it('stores the complete Xero source snapshot and required foreign-key actions', () => {
    for (const column of [
      'source_invoice_type TEXT NOT NULL',
      'source_invoice_date DATE NOT NULL',
      'source_account_code TEXT',
      'source_description TEXT',
      'source_ex_gst_cents BIGINT NOT NULL',
      'source_fingerprint TEXT NOT NULL',
    ]) {
      expect(compactSql).toContain(column)
    }

    expect(compactSql).toContain('client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE')
    expect(compactSql).toContain('project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE')
    expect(compactSql).toContain('assigned_by UUID REFERENCES team_members(id) ON DELETE SET NULL')
    expect(compactSql).toContain('client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT')
    expect(compactSql).toContain('previous_project_id UUID REFERENCES projects(id) ON DELETE SET NULL')
    expect(compactSql).toContain('new_project_id UUID REFERENCES projects(id) ON DELETE SET NULL')
    expect(compactSql).toContain('actor_id UUID REFERENCES team_members(id) ON DELETE SET NULL')
  })

  it('uses idempotent table/index definitions and reconciliation indexes', () => {
    expect(compactSql).toContain('CREATE TABLE IF NOT EXISTS agency_client_xero_tracking_mappings')
    expect(compactSql).toContain('CREATE TABLE IF NOT EXISTS xero_project_allocations')
    expect(compactSql).toContain('CREATE TABLE IF NOT EXISTS financial_allocation_audit')
    expect(compactSql).toContain('CREATE INDEX IF NOT EXISTS idx_acxtm_tracking_option ON agency_client_xero_tracking_mappings (tenant_id, tracking_option_name)')
    expect(compactSql).toContain('CREATE INDEX IF NOT EXISTS idx_xpa_client_project ON xero_project_allocations (tenant_id, client_id, project_id)')
    expect(compactSql).toContain('CREATE INDEX IF NOT EXISTS idx_xpa_invoice ON xero_project_allocations (tenant_id, invoice_id)')
    expect(compactSql).toContain('CREATE INDEX IF NOT EXISTS idx_xpa_fingerprint ON xero_project_allocations (tenant_id, source_fingerprint)')
    expect(compactSql).toContain('CREATE INDEX IF NOT EXISTS idx_faa_client_changed ON financial_allocation_audit (tenant_id, client_id, changed_at DESC)')
  })

  it('enforces append-only audit history while allowing inserts', () => {
    expect(compactSql).toContain('CREATE OR REPLACE FUNCTION prevent_financial_allocation_audit_mutation()')
    expect(compactSql).toContain("IF TG_OP = 'INSERT' THEN RETURN NEW;")
    expect(compactSql).toContain("RAISE EXCEPTION 'financial_allocation_audit is append-only'")
    expect(compactSql).toContain('DROP TRIGGER IF EXISTS financial_allocation_audit_append_only ON financial_allocation_audit')
    expect(compactSql).toContain('DROP TRIGGER IF EXISTS financial_allocation_audit_append_only_truncate ON financial_allocation_audit')
    expect(compactSql).toContain('BEFORE UPDATE OR DELETE ON financial_allocation_audit FOR EACH ROW')
    expect(compactSql).toContain('BEFORE TRUNCATE ON financial_allocation_audit FOR EACH STATEMENT')
    expect(compactSql).toContain('metadata JSONB NOT NULL DEFAULT \'{}\'::jsonb')
    expect(compactSql).toContain('changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()')
    expect(compactSql).not.toContain('BEFORE INSERT ON financial_allocation_audit')
  })
})
