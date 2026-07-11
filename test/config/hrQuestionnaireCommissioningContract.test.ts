import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const preview = readFileSync('server/api/agency/hr/reviews/preview.post.ts', 'utf8')
const send = readFileSync('server/api/agency/hr/reviews/index.post.ts', 'utf8')

describe('HR questionnaire commissioning contract', () => {
  it('previews recipient-specific questions without sending', () => {
    expect(preview).toContain('requireHrAdmin(event)')
    expect(preview).toContain("'Cache-Control', 'private, no-store'")
    expect(preview).toContain('hrReviewCycleDraftSchema.safeParse')
    expect(preview).toContain('recommendationReason')
    expect(preview).toContain('sourceRefs')
    expect(preview).toContain('normalizeSourceRefs')
    expect(preview).toContain("version.status = 'approved'")
    expect(preview).toContain("version.permitted_uses @> '[\"questionnaire_design\"]'::jsonb")
    expect(preview).toContain('version.effective_from <= CURRENT_DATE')
    expect(preview).toContain('version.review_due_at >= CURRENT_DATE')
    expect(preview).toContain('knowledgeContext')
    expect(preview).toContain('relevantKnowledgeForRole')
    expect(preview).toContain('JOIN hr_role_assignments assignment')
    expect(preview).toContain('assignment.effective_to IS NULL')
    expect(preview).not.toContain('createNotification')
    expect(preview).not.toContain('sendHrReviewAssignmentEmail')
  })

  it('publishes an immutable per-recipient questionnaire only after explicit approval', () => {
    expect(send).toContain('ownerConfirmed')
    expect(send).toContain('participantInput.questions')
    expect(send).toContain("`cycle-${cycle.id}-${participantInput.teamMemberId}`")
    expect(send).toContain("'published'")
    expect(send).toContain('questionnaire.commissioned')
    expect(send).toContain('JOIN hr_role_assignments assignment')
    expect(send).not.toContain('INSERT INTO hr_role_assignments')
    expect(send).not.toContain('UPDATE hr_role_assignments')
  })
})
