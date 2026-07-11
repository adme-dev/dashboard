import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
const source = readFileSync('server/api/agency/hr/monday/index.post.ts', 'utf8')
describe('HR Monday indexing security contract', () => {
  it('requires owner access and approved scope', () => {
    expect(source).toContain('requireHrAdmin(event)')
    expect(source).toContain('getActiveMondayEvidenceScope()')
    expect(source).toContain('monday_knowledge.indexed')
  })
  it('indexes only bounded provenance-linked content', () => {
    expect(source).toContain('hr_knowledge_records')
    expect(source).toContain('mim.status = \'completed\'')
    expect(source).toContain('mim.created_at::date BETWEEN GREATEST')
    expect(source).toContain("!allowed.has('name') && !allowed.has('title')")
    expect(source).toContain('NOT EXISTS')
    expect(source).toContain("COALESCE(mim.monday_board_id, bm.monday_board_id) || ':' || mim.monday_item_id")
    expect(source).toContain('SELECT DISTINCT ON')
    expect(source).toContain('Private messages, comments, files, and questionnaire answers are excluded')
    expect(source).not.toContain('source_data')
  })
})
