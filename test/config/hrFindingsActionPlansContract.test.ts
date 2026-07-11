import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync('server/database/migrations/239_hr_findings_action_plans.sql', 'utf8')
const createFinding = readFileSync('server/api/agency/hr/reviews/participants/[id]/findings.post.ts', 'utf8')
const listFindings = readFileSync('server/api/agency/hr/reviews/participants/[id]/findings.get.ts', 'utf8')
const respond = readFileSync('server/api/agency/hr/findings/[id]/response.post.ts', 'utf8')
const transition = readFileSync('server/api/agency/hr/findings/[id].patch.ts', 'utf8')
const createAction = readFileSync('server/api/agency/hr/reviews/participants/[id]/follow-ups.post.ts', 'utf8')
const actionSchema = readFileSync('server/utils/hr/schemas.ts', 'utf8')

describe('governed HR findings and action plans', () => {
  it('stores evidence, contrary-evidence review, accountability, confidence, response, and dual approval', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS hr_review_findings')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS hr_finding_responses')
    for (const field of ['accountability_class', 'evidence_refs JSONB', 'contrary_evidence_review', 'confidence', 'adverse_individual', 'second_approved_by', 'no_action_rationale']) {
      expect(migration).toContain(field)
    }
    expect(transition).toContain('Second approver must be different from the finding author')
    expect(transition).toContain('participant_response_status')
    expect(transition).toContain('no_action_rationale')
  })

  it('gives participants a disclosed response path without exposing drafts or private reviewer material', () => {
    for (const route of [createFinding, listFindings, respond, transition]) {
      expect(route).toContain("'Cache-Control', 'private, no-store'")
      expect(route).toContain('requireAuth(event)')
    }
    expect(listFindings).toContain("finding.status IN ('participant_review', 'awaiting_second_approval', 'published')")
    expect(respond).toContain('finding.team_member_id !== user.id')
    expect(respond).toContain("action: 'finding.participant_responded'")
  })

  it('extends action plans with balanced responsibilities, support, success and closure controls', () => {
    for (const field of ['finding_id UUID', 'employee_responsibility TEXT', 'business_responsibility TEXT', 'support_commitment TEXT', 'success_measure TEXT', 'review_at TIMESTAMPTZ', 'closure_acknowledged_at TIMESTAMPTZ']) {
      expect(migration).toContain(field)
    }
    for (const field of ['employeeResponsibility', 'businessResponsibility', 'supportCommitment', 'successMeasure', 'reviewAt']) {
      expect(actionSchema).toContain(field)
      expect(createAction).toContain(field)
    }
    expect(createAction).toContain('Action-plan finding must belong to this participant')
  })
})
