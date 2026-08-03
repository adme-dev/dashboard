import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../server/database/migrations/334_search_authority_performance_evidence.sql',
  import.meta.url
)

describe('search authority performance evidence migration', () => {
  it('creates bounded tenant and page scoped observations', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS search_authority_performance_evidence/i)
    expect(sql).toMatch(/FOREIGN KEY \(client_id, page_id\)[\s\S]*site_intelligence_pages\(client_id, id\)/i)
    expect(sql).toMatch(/strategy IN \('mobile'\)/i)
    expect(sql).toMatch(/status IN \('available', 'partial', 'unavailable'\)/i)
    expect(sql).toMatch(/octet_length\(evidence::text\) <= 16384/i)
  })
})
