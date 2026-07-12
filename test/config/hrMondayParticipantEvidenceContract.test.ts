import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync('server/api/agency/hr/monday/evidence/my.get.ts', 'utf8')
const participantUi = readFileSync('app/pages/agency/hr/assignments/[id].vue', 'utf8')

describe('HR Monday participant evidence contract', () => {
  it('requires authentication and limits results to the current assignee', () => {
    expect(source).toContain('requireAuth(event)')
    expect(source).toContain('assignee_id = $2')
    expect(source).toContain('read-only evidence view')
  })
  it('applies approved scope and retention controls', () => {
    expect(source).toContain('getActiveMondayEvidenceScope()')
    expect(source).toContain('FROM hr_monday_evidence_extracts')
    expect(source).toContain('scope_id = $1')
    expect(source).toContain('expires_at > NOW()')
    expect(source).not.toContain('monday_item_mappings')
  })
  it('discloses bounded evidence inside the participant review workflow', () => {
    expect(participantUi).toContain("'/api/agency/hr/monday/evidence/my'")
    expect(participantUi).toContain('Your Monday work items')
    expect(participantUi).toContain('they do not determine your review score')
    expect(participantUi).toContain('mondayEvidenceNotice')
  })
})
