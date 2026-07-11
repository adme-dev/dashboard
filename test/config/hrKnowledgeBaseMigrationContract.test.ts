import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../../server/database/migrations/238_hr_governed_knowledge_base.sql', import.meta.url), 'utf8')

describe('governed HR knowledge base migration', () => {
  it('stores typed logical entries and immutable versioned content separately', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS hr_knowledge_entries')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS hr_knowledge_entry_versions')
    expect(migration).toContain('UNIQUE (entry_id, version)')
    expect(migration).toContain("status IN ('draft', 'disputed', 'approved', 'superseded', 'archived')")
    expect(migration).toContain('supersedes_version_id UUID')
  })

  it('records provenance, governance, retention review, and general-index exclusion', () => {
    for (const field of ['source_refs JSONB', 'permitted_uses JSONB', 'effective_from DATE', 'review_due_at DATE', 'confidentiality TEXT', 'general_ai_excluded BOOLEAN NOT NULL DEFAULT TRUE']) {
      expect(migration).toContain(field)
    }
    expect(migration).toContain('CHECK (general_ai_excluded = TRUE)')
  })

  it('prevents approved knowledge content from being edited in place', () => {
    expect(migration).toContain('prevent_approved_hr_knowledge_mutation')
    expect(migration).toContain("OLD.status = 'approved'")
  })
})
