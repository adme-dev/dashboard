import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../server/database/migrations/288_automotive_site_intelligence.sql',
  import.meta.url
)

describe('automotive site intelligence migration', () => {
  it('creates the five tenant-scoped intelligence relations', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    for (const relation of [
      'site_intelligence_domains',
      'site_intelligence_crawl_runs',
      'site_intelligence_pages',
      'site_intelligence_changes',
      'site_intelligence_insights'
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${relation}\\s*\\(`, 'i'))
      expect(sql).toMatch(new RegExp(`${relation}[\\s\\S]*?client_id UUID NOT NULL REFERENCES agency_clients\\(id\\)`, 'i'))
    }
  })

  it('enforces bounded crawl policy and excludes AI training', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toMatch(/lane IN \('owned', 'competitor'\)/i)
    expect(sql).toMatch(/page_limit BETWEEN 1 AND 200/i)
    expect(sql).toMatch(/crawl_depth BETWEEN 0 AND 5/i)
    expect(sql).toMatch(/retention_days BETWEEN 1 AND 365/i)
    expect(sql).toMatch(/NOT \('ai-train' = ANY\(crawl_purposes\)\)/i)
    expect(sql).toMatch(/UNIQUE \(client_id, origin, lane\)/i)
  })

  it('protects run replay, canonical pages, and query paths', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toMatch(/workflow_instance_id TEXT UNIQUE/i)
    expect(sql).toMatch(/UNIQUE \(domain_id, canonical_url\)/i)
    expect(sql).toMatch(/UNIQUE \(run_id, batch_key\)/i)
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_site_intelligence_domains_client_status/i)
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_site_intelligence_runs_domain_status/i)
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_site_intelligence_changes_client_observed/i)
  })

  it('keeps structured payloads as JSON objects and bounds stored error text', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toMatch(/jsonb_typeof\(facts\) = 'object'/i)
    expect(sql).toMatch(/jsonb_typeof\(fact_diff\) = 'object'/i)
    expect(sql).toMatch(/char_length\(error_summary\) <= 1000/i)
  })
})
