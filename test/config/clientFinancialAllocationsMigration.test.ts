import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('server/database/migrations/337_client_financial_allocations.sql', 'utf8')

describe('client financial allocation migration', () => {
  it('creates durable one-to-one mappings and append-only audit storage', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agency_client_xero_tracking_mappings')
    expect(sql).toContain('PRIMARY KEY (tenant_id, client_id)')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS xero_project_allocations')
    expect(sql).toContain('PRIMARY KEY (tenant_id, line_item_id)')
    expect(sql).toContain('source_fingerprint TEXT NOT NULL')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS financial_allocation_audit')
    expect(sql).toContain("CHECK (source_type IN ('media_spend', 'xero_line', 'client_tracking'))")
    expect(sql).not.toContain('REFERENCES xero_invoice_lines_cache')
  })

  it('indexes reconciliation and stale-mapping lookups', () => {
    expect(sql).toContain('idx_xpa_client_project')
    expect(sql).toContain('idx_xpa_invoice')
    expect(sql).toContain('idx_faa_client_changed')
  })
})
