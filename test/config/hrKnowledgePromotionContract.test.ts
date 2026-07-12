import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const candidates = readFileSync('server/api/agency/hr/knowledge/promotion-candidates.get.ts', 'utf8')
const promote = readFileSync('server/api/agency/hr/knowledge/promote.post.ts', 'utf8')
const page = readFileSync('app/pages/agency/hr/knowledge.vue', 'utf8')

describe('HR review-learning knowledge promotion', () => {
  it('lists only published findings and completed actions without questionnaire sources', () => {
    expect(candidates).toContain("finding.status = 'published'")
    expect(candidates).toContain("action.status = 'completed'")
    expect(candidates).not.toContain('hr_responses')
  })

  it('creates a source-cited restricted draft and never auto-approves it', () => {
    expect(promote).toContain('requireHrAdmin(event)')
    expect(promote).toContain("'draft'")
    expect(promote).toContain('general_ai_excluded')
    expect(promote).toContain('TRUE')
    expect(promote).not.toContain("'approved'")
    expect(promote).toContain("action: 'hr_knowledge.review_learning_promoted'")
  })

  it('requires an explicit review action in the HR knowledge UI', () => {
    expect(page).toContain('Review learning candidates')
    expect(page).toContain('Create governed draft')
    expect(page).toContain('Nothing is promoted automatically')
  })
})
