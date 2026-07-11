import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
const source = readFileSync('server/database/migrations/229_hr_knowledge_index.sql', 'utf8')
describe('HR knowledge index contract', () => {
  it('keeps relational provenance and vector indexing separate', () => {
    expect(source).toContain('source_type VARCHAR(40)')
    expect(source).toContain('source_id VARCHAR(160)')
    expect(source).toContain('vector_id VARCHAR(200)')
    expect(source).toContain('UNIQUE(source_type, source_id)')
  })
  it('supports private access and retention revocation', () => {
    expect(source).toContain("access_policy VARCHAR(30) NOT NULL DEFAULT 'hr_owner'")
    expect(source).toContain('retention_until DATE')
    expect(source).toContain('revoked_at TIMESTAMPTZ')
  })
})
