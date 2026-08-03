import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL(
  '../../server/database/migrations/335_search_authority_content_workflow.sql',
  import.meta.url
), 'utf8')

describe('search authority governed content migration', () => {
  it('creates separate tenant-scoped workflow relations', () => {
    for (const table of [
      'search_authority_content_assets',
      'search_authority_source_interviews',
      'search_authority_content_versions',
      'search_authority_version_claims',
      'search_authority_approval_decisions',
      'search_authority_publications',
      'search_authority_content_audit_events'
    ]) expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\s*\\(`, 'i'))
    expect(sql).toMatch(/UNIQUE \(site_id, slug\)/i)
  })

  it('makes versions append-only and publications reference approved versions', () => {
    expect(sql).toMatch(/prevent_search_authority_version_mutation/i)
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON search_authority_content_versions/i)
    expect(sql).toMatch(/version_id UUID NOT NULL/i)
    expect(sql).toMatch(/decision IN \('approved', 'rejected'\)/i)
    expect(sql).toMatch(/status IN \('draft', 'in_review', 'approved', 'rejected', 'published', 'archived'\)/i)
  })
})
