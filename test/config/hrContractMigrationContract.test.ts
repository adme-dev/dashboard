import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/221_hr_contract_vault.sql', import.meta.url),
  'utf8',
)

describe('HR contract vault migration', () => {
  it('keeps originals and approved role extracts in dedicated restricted tables', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS hr_contract_documents')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS hr_contract_role_extracts')
    expect(migration).toContain('UNIQUE (team_member_id, version)')
    expect(migration).toContain('contract_document_id UUID NOT NULL UNIQUE')
  })

  it('records checksum, retention and explicit sensitive-field omissions', () => {
    expect(migration).toContain('checksum_sha256')
    expect(migration).toContain('retention_review_at')
    expect(migration).toContain('omitted_sensitive_fields')
    expect(migration).toContain('"remuneration"')
    expect(migration).toContain('"protected attributes"')
  })
})
