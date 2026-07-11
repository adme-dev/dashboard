import { describe, expect, it } from 'vitest'
import { buildRoleQuestionnaire } from '../../../../server/utils/hr/questionnaire'
import { validateHrAnswers } from '../../../../server/utils/hr/responses'

describe('HR questionnaire response validation', () => {
  const questions = buildRoleQuestionnaire(['Publish the monthly client report'])

  it('allows incomplete drafts but requires every required question at submission', () => {
    expect(validateHrAnswers(questions, { 'core-role-clarity': 'clear' }, false).isValid).toBe(true)
    expect(validateHrAnswers(questions, { 'core-role-clarity': 'clear' }, true).isValid).toBe(false)
  })

  it('rejects invented choices and contradictory blocker selections', () => {
    expect(validateHrAnswers(questions, { 'core-role-clarity': 'perfect' }, false).issues[0]?.message).toContain('available choices')
    expect(validateHrAnswers(questions, { 'blockers-categories': ['none', 'capacity'] }, false).issues[0]?.message).toContain('cannot be combined')
  })
})
