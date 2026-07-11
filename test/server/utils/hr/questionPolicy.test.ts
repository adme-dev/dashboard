import { describe, expect, it } from 'vitest'
import { evaluateHrQuestionQuality } from '~~/server/utils/hr/questionPolicy'

describe('HR neutral-question policy', () => {
  it('accepts a neutral, time-bounded blocker question with balanced options', () => {
    const result = evaluateHrQuestionQuality({
      prompt: 'During this review period, how often did missing information affect an agreed deadline?',
      options: ['Never', 'Once', 'Two or three times', 'About weekly', 'More than weekly', 'Not sure or not applicable'],
    })

    expect(result.isPublishable).toBe(true)
    expect(result.issues).toEqual([])
  })

  it('flags leading assumptions and unbalanced options', () => {
    const result = evaluateHrQuestionQuality({
      prompt: "Poor communication regularly makes your work late, doesn't it?",
      options: ['Yes', 'Definitely'],
    })

    expect(result.isPublishable).toBe(false)
    expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'LEADING_ASSUMPTION',
      'UNBALANCED_OPTIONS',
    ]))
  })

  it('blocks sensitive-trait and personality questions', () => {
    const result = evaluateHrQuestionQuality({
      prompt: 'Does your mental health make you an introverted poor culture fit?',
      options: ['Yes', 'No'],
    })

    expect(result.isPublishable).toBe(false)
    expect(result.issues.map(issue => issue.code)).toContain('PROHIBITED_TOPIC')
  })

  it.each([
    'What is your racial background?',
    'How does your gender identity affect your work?',
    'Does your age affect your output?',
    'Do you have a disability?',
    'What is your sexual orientation?',
    'Are you pregnant?',
    'What are your religious beliefs?',
    'Are you involved in union activity?',
  ])('blocks protected-attribute question: %s', (prompt) => {
    const result = evaluateHrQuestionQuality({ prompt, options: ['Yes', 'No', 'Prefer not to say'] })

    expect(result.isPublishable).toBe(false)
    expect(result.issues.map(issue => issue.code)).toContain('PROHIBITED_TOPIC')
  })
})
