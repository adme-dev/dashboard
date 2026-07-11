import { describe, expect, it } from 'vitest'
import { aggregateHrFeedback } from '../../../../server/utils/hr/aggregateFeedback'

const questions = [{ id: 'blockers-categories', prompt: 'Which factors?', type: 'multiple_choice', module: 'blockers', options: [
  { value: 'capacity', label: 'Available time or capacity' },
  { value: 'approvals', label: 'Approval or decision delays' },
] }]

describe('HR aggregate feedback', () => {
  it('suppresses a cohort below five and returns no answer counts', () => {
    const result = aggregateHrFeedback(Array.from({ length: 4 }, (_, index) => ({ responseId: `r${index}`, answers: { 'blockers-categories': ['capacity'] }, questions })))
    expect(result).toEqual({ cohortSize: 4, minimumCohortSize: 5, suppressed: true, themes: [] })
  })

  it('returns only option counts for an eligible cohort and excludes free text', () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({
      responseId: `r${index}`,
      answers: { 'blockers-categories': index < 3 ? ['capacity'] : ['approvals'], context: `private ${index}` },
      questions: [...questions, { id: 'context', prompt: 'Context', type: 'optional_text', module: 'blockers' }],
    }))
    expect(aggregateHrFeedback(rows)).toEqual({
      cohortSize: 5, minimumCohortSize: 5, suppressed: false,
      themes: [{ questionId: 'blockers-categories', prompt: 'Which factors?', options: [
        { value: 'capacity', label: 'Available time or capacity', count: 3 },
        { value: 'approvals', label: 'Approval or decision delays', count: 2 },
      ] }],
    })
  })

  it('suppresses a role-specific question that appears in fewer than five responses', () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({
      responseId: `r${index}`,
      answers: index === 0 ? { specialist: 'often' } : {},
      questions: index === 0 ? [{ id: 'specialist', prompt: 'Specialist question', type: 'single_choice', options: [{ value: 'often', label: 'Often' }] }] : [],
    }))
    expect(aggregateHrFeedback(rows)).toMatchObject({ suppressed: false, themes: [] })
  })
})
