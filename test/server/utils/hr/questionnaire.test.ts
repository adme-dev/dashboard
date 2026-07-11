import { describe, expect, it } from 'vitest'
import { buildRoleQuestionnaire } from '../../../../server/utils/hr/questionnaire'

describe('role questionnaire builder', () => {
  it('adds neutral core, role-specific, blocker, optional context, and not-applicable choices', () => {
    const questions = buildRoleQuestionnaire([
      'Publish the monthly client performance report',
      'Maintain campaign pacing within approved budgets',
    ])

    expect(questions.filter(question => question.module === 'role')).toHaveLength(2)
    expect(questions.some(question => question.module === 'blockers')).toBe(true)
    expect(questions.some(question => question.required === false)).toBe(true)
    expect(questions.filter(question => question.options).every(question =>
      question.options?.some(option => option.value === 'not_applicable'),
    )).toBe(true)
  })

  it('caps role-specific questions and removes blank responsibilities', () => {
    const responsibilities = ['', ...Array.from({ length: 25 }, (_, index) => `Responsibility ${index + 1}`)]
    const questions = buildRoleQuestionnaire(responsibilities)
    expect(questions.filter(question => question.module === 'role')).toHaveLength(20)
  })
})
