import type { HrQuestion } from './questionnaire'

export type HrAnswerValue = string | string[]
export type HrAnswers = Record<string, HrAnswerValue>

export type HrAnswerValidation = {
  isValid: boolean
  issues: Array<{ questionId: string; message: string }>
}

export function validateHrAnswers(questions: HrQuestion[], answers: HrAnswers, submitting: boolean): HrAnswerValidation {
  const issues: HrAnswerValidation['issues'] = []
  const questionIds = new Set(questions.map(question => question.id))

  for (const answerId of Object.keys(answers)) {
    if (!questionIds.has(answerId)) issues.push({ questionId: answerId, message: 'Answer does not belong to this questionnaire.' })
  }

  for (const question of questions) {
    const answer = answers[question.id]
    const isEmpty = answer === undefined || answer === '' || (Array.isArray(answer) && answer.length === 0)
    if (submitting && question.required && isEmpty) {
      issues.push({ questionId: question.id, message: 'A response is required.' })
      continue
    }
    if (isEmpty) continue

    if (question.type === 'multiple_choice') {
      if (!Array.isArray(answer)) {
        issues.push({ questionId: question.id, message: 'Select one or more available choices.' })
        continue
      }
      if (answer.includes('none') && answer.length > 1) {
        issues.push({ questionId: question.id, message: '“None of these” cannot be combined with another choice.' })
      }
    } else if (Array.isArray(answer)) {
      issues.push({ questionId: question.id, message: 'Select a single response.' })
      continue
    }

    if (question.options) {
      const allowed = new Set(question.options.map(option => option.value))
      const values = Array.isArray(answer) ? answer : [answer]
      if (values.some(value => !allowed.has(value))) {
        issues.push({ questionId: question.id, message: 'Response is not one of the available choices.' })
      }
    } else if (typeof answer === 'string' && answer.length > 5000) {
      issues.push({ questionId: question.id, message: 'Response must be 5,000 characters or fewer.' })
    }
  }

  return { isValid: issues.length === 0, issues }
}
