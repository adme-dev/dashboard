import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const score = readFileSync('server/api/agency/hr/reviews/participants/[id]/scorecard.put.ts', 'utf8')
const finding = readFileSync('server/api/agency/hr/findings/[id].patch.ts', 'utf8')
const onboarding = readFileSync('server/api/agency/hr/onboarding/index.get.ts', 'utf8')
const mondayEvidence = readFileSync('server/api/agency/hr/monday/evidence.get.ts', 'utf8')

describe('HR AI safety gate', () => {
  it('contains no model call in rating or finding publication boundaries', () => {
    for (const source of [score, finding]) {
      expect(source).not.toMatch(/groq|openai|chatCompletion|generateText|workersAI/i)
      expect(source).toContain('requireAuth(event)')
    }
  })

  it('requires a human reviewer and second approval for adverse findings', () => {
    expect(score).toContain('Only the assigned reviewer may score this review')
    expect(finding).toContain('awaiting_second_approval')
    expect(finding).toContain('second_approved_by')
  })

  it('declares no automated employment decisions and no performance use of Monday preview', () => {
    expect(onboarding).toContain('automatedEmploymentDecisions: false')
    expect(mondayEvidence).toContain('This preview does not score employees or make performance determinations')
  })
})
