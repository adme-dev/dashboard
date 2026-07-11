import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync('server/api/agency/hr/monday/evidence.get.ts', 'utf8')

describe('HR Monday evidence adapter security contract', () => {
  it('requires HR owner access and fails closed without an approved scope', () => {
    expect(source).toContain('requireHrAdmin(event)')
    expect(source).toContain("NO_APPROVED_SCOPE")
    expect(source).toContain('getActiveMondayEvidenceScope()')
  })

  it('is bounded to approved boards and period and excludes raw source content', () => {
    expect(source).toContain('COALESCE(mim.monday_board_id, bm.monday_board_id) = ANY($1::text[])')
    expect(source).toContain('LEFT JOIN monday_board_mappings bm')
    expect(source).toContain('mim.created_at::date BETWEEN GREATEST($2::date')
    expect(source).toContain("CURRENT_DATE - ($4::int * INTERVAL '1 day')")
    expect(source).toContain("mim.status = 'completed'")
    expect(source).toContain('SELECT DISTINCT ON')
    expect(source).not.toContain('source_data')
    expect(source).not.toContain('t.description')
    expect(source).toContain('monday_evidence.viewed')
    expect(source).toContain('const allowed = new Set')
    expect(source).toContain('[redacted by scope]')
  })
})
