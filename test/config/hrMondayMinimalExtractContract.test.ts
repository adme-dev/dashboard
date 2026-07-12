import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync('server/database/migrations/247_hr_monday_minimal_evidence_extracts.sql', 'utf8')
const refresh = readFileSync('server/utils/hr/mondayEvidenceExtract.ts', 'utf8')
const ownerEvidence = readFileSync('server/api/agency/hr/monday/evidence.get.ts', 'utf8')
const participantEvidence = readFileSync('server/api/agency/hr/monday/evidence/my.get.ts', 'utf8')
const suggestions = readFileSync('server/utils/hr/mondayProcessSuggestionSource.ts', 'utf8')

describe('minimal HR Monday evidence extracts', () => {
  it('stores only allowlisted relational fields with provenance, expiry and no raw content columns', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS hr_monday_evidence_extracts')
    expect(migration).toContain('source_ref TEXT NOT NULL')
    expect(migration).toContain('expires_at TIMESTAMPTZ NOT NULL')
    for (const forbiddenColumn of ['source_data JSON', 'column_values JSON', 'body_text TEXT', 'file_url TEXT', 'description TEXT']) {
      expect(migration).not.toContain(forbiddenColumn)
    }
  })

  it('applies the allowlist before persistence and removes expired or out-of-scope extracts', () => {
    expect(refresh).toContain('CASE WHEN $6::boolean THEN monday_item_name ELSE NULL END')
    expect(refresh).toContain('DELETE FROM hr_monday_evidence_extracts')
    expect(refresh).not.toContain('mapping.source_data')
    expect(refresh).not.toContain('mapping.column_values')
  })

  it('makes every HR evidence and suggestion reader use only the minimal extract', () => {
    for (const source of [ownerEvidence, participantEvidence, suggestions]) {
      expect(source).toContain('hr_monday_evidence_extracts')
      expect(source).not.toContain('monday_item_mappings')
    }
  })
})
