import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync('server/api/agency/hr/monday/evidence.get.ts', 'utf8')

describe('HR Monday evidence adapter security contract', () => {
  it('requires HR owner access and fails closed without an approved scope', () => {
    expect(source).toContain('requireHrAdmin(event)')
    expect(source).toContain("NO_APPROVED_SCOPE")
    expect(source).toContain('getActiveMondayEvidenceScope()')
  })

  it('reads only the purpose-limited, unexpired HR extract and excludes raw source content', () => {
    expect(source).toContain('FROM hr_monday_evidence_extracts')
    expect(source).toContain('scope_id = $1 AND expires_at > NOW()')
    expect(source).not.toContain('monday_item_mappings')
    expect(source).not.toContain('source_data')
    expect(source).not.toContain('t.description')
    expect(source).toContain('monday_evidence.viewed')
    expect(source).toContain('const allowed = new Set')
    expect(source).toContain('[redacted by scope]')
  })
})
