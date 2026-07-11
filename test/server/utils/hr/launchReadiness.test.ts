import { describe, expect, it } from 'vitest'
import { evaluateHrLaunchReadiness, HR_LAUNCH_GATE_KEYS } from '../../../../server/utils/hr/launchReadiness'

describe('HR launch readiness', () => {
  const approved = Object.fromEntries(HR_LAUNCH_GATE_KEYS.map(key => [key, {
    status: 'approved', approvedAt: '2026-07-11T00:00:00.000Z', expiresAt: '2027-07-11T00:00:00.000Z'
  }])) as any

  it('is ready only when every required gate is approved and current', () => {
    expect(evaluateHrLaunchReadiness(approved, new Date('2026-07-12T00:00:00.000Z')))
      .toMatchObject({ ready: true, missing: [], expired: [] })
  })

  it('fails closed for missing, rejected, or expired approvals', () => {
    const input = structuredClone(approved)
    delete input.accessibility_review
    input.ai_safety_review.status = 'rejected'
    input.privacy_impact_assessment.expiresAt = '2026-07-01T00:00:00.000Z'

    const result = evaluateHrLaunchReadiness(input, new Date('2026-07-12T00:00:00.000Z'))
    expect(result.ready).toBe(false)
    expect(result.missing).toEqual(expect.arrayContaining(['accessibility_review', 'ai_safety_review']))
    expect(result.expired).toEqual(['privacy_impact_assessment'])
  })

  it('requires human-decision and no-hidden-monitoring attestations', () => {
    expect(HR_LAUNCH_GATE_KEYS).toEqual(expect.arrayContaining([
      'human_decision_only', 'no_hidden_monitoring', 'scoring_calibration', 'pilot_approval'
    ]))
  })
})
