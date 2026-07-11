import { describe, expect, it } from 'vitest'
import { hrOwnerOnboardingSchema } from '../../../../server/utils/hr/schemas'

const validInput = {
  currentStep: 4,
  status: 'draft',
  answers: {
    business: { reviewObjectives: ['Clarify ownership'], departments: ['Operations'] },
    evidence: {
      approvedSources: ['platform', 'monday'],
      excludedChannels: ['leadership-private'],
      lookbackDays: 90,
      includePrivateMessages: false,
    },
  },
  consentedSources: ['platform', 'monday'],
}

describe('HR owner onboarding schema', () => {
  it('accepts a scoped, privacy-preserving draft and fills safeguards', () => {
    const parsed = hrOwnerOnboardingSchema.parse(validInput)
    expect(parsed.answers.fairness.humanReviewRequired).toBe(true)
    expect(parsed.answers.evidence.includePrivateMessages).toBe(false)
  })

  it('rejects consent to private messages and automated employment decisions', () => {
    expect(() => hrOwnerOnboardingSchema.parse({
      ...validInput,
      answers: {
        ...validInput.answers,
        evidence: { ...validInput.answers.evidence, includePrivateMessages: true },
      },
    })).toThrow()

    expect(() => hrOwnerOnboardingSchema.parse({
      ...validInput,
      answers: {
        ...validInput.answers,
        fairness: { humanReviewRequired: true, noAutomatedEmploymentDecisions: false },
      },
    })).toThrow()
  })
})
