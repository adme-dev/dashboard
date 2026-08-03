import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../server/database/migrations/333_search_authority_trust_findings.sql',
  import.meta.url
)

describe('search authority trust findings migration', () => {
  it('creates a tenant-scoped, page-scoped findings ledger', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS search_authority_trust_findings\s*\(/i)
    expect(sql).toMatch(/client_id UUID NOT NULL REFERENCES agency_clients\(id\)/i)
    expect(sql).toMatch(/FOREIGN KEY \(client_id, domain_id\)[\s\S]*site_intelligence_domains\(client_id, id\)/i)
    expect(sql).toMatch(/FOREIGN KEY \(client_id, page_id\)[\s\S]*site_intelligence_pages\(client_id, id\)/i)
    expect(sql).toMatch(/UNIQUE \(domain_id, fingerprint\)/i)
  })

  it('bounds evidence and constrains severity, owner and lifecycle state', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toMatch(/severity IN \('info', 'low', 'medium', 'high', 'critical'\)/i)
    expect(sql).toMatch(/owner IN \('xeroflow', 'dealer_origin', 'external_provider'\)/i)
    expect(sql).toMatch(/lifecycle_status IN \('open', 'actioned', 'resolved', 'dismissed'\)/i)
    expect(sql).toMatch(/octet_length\(evidence::text\) <= 8192/i)
    expect(sql).toMatch(/fingerprint ~ '\^\[0-9a-f\]\{64\}\$'/i)
  })
})
