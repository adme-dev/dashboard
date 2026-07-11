import { describe, expect, it } from 'vitest'
import { calculateHrRoleScore } from '~~/server/utils/hr/scoring'

describe('HR role scoring', () => {
  it('calculates a weighted role score only from sufficiently evidenced criteria', () => {
    const result = calculateHrRoleScore({
      criteria: [
        { id: 'delivery', weight: 30, rating: 4, hasSufficientEvidence: true },
        { id: 'quality', weight: 25, rating: 3, hasSufficientEvidence: true },
        { id: 'timeliness', weight: 20, rating: 2, hasSufficientEvidence: true },
        { id: 'learning', weight: 25, rating: null, hasSufficientEvidence: false },
      ],
      operationalEnablement: 2.1,
    })

    expect(result.isPublishable).toBe(true)
    expect(result.evidenceCoverage).toBe(75)
    expect(result.rolePerformanceScore).toBe(3.13)
    expect(result.operationalEnablement).toBe(2.1)
    expect(result.confidence).toBe('medium')
  })

  it('abstains when weighted evidence coverage is below 70 percent', () => {
    const result = calculateHrRoleScore({
      criteria: [
        { id: 'delivery', weight: 40, rating: 4, hasSufficientEvidence: true },
        { id: 'quality', weight: 25, rating: 3, hasSufficientEvidence: true },
        { id: 'timeliness', weight: 35, rating: null, hasSufficientEvidence: false },
      ],
      operationalEnablement: 4,
    })

    expect(result.isPublishable).toBe(false)
    expect(result.evidenceCoverage).toBe(65)
    expect(result.rolePerformanceScore).toBeNull()
    expect(result.reason).toBe('INSUFFICIENT_EVIDENCE')
  })

  it('rejects invalid weights and out-of-range ratings', () => {
    expect(() => calculateHrRoleScore({
      criteria: [{ id: 'delivery', weight: 120, rating: 6, hasSufficientEvidence: true }],
      operationalEnablement: 3,
    })).toThrow('Scorecard weights must total 100')
  })

  it('publishes at exactly 70 percent coverage and abstains immediately below it', () => {
    const atThreshold = calculateHrRoleScore({ criteria: [
      { id: 'evidenced', weight: 70, rating: 3, hasSufficientEvidence: true },
      { id: 'missing', weight: 30, rating: null, hasSufficientEvidence: false },
    ], operationalEnablement: 1 })
    const belowThreshold = calculateHrRoleScore({ criteria: [
      { id: 'evidenced', weight: 69.99, rating: 5, hasSufficientEvidence: true },
      { id: 'missing', weight: 30.01, rating: null, hasSufficientEvidence: false },
    ], operationalEnablement: 5 })

    expect(atThreshold.isPublishable).toBe(true)
    expect(belowThreshold).toMatchObject({ isPublishable: false, rolePerformanceScore: null })
  })

  it('is monotonic for the same approved evidence and role weights', () => {
    const score = (delivery: number) => calculateHrRoleScore({ criteria: [
      { id: 'delivery', weight: 50, rating: delivery, hasSufficientEvidence: true },
      { id: 'quality', weight: 50, rating: 3, hasSufficientEvidence: true },
    ], operationalEnablement: 3 }).rolePerformanceScore!
    expect(score(4)).toBeGreaterThan(score(3))
  })

  it('keeps operational enablement contextual and out of the role score', () => {
    const input = { criteria: [{ id: 'delivery', weight: 100, rating: 4, hasSufficientEvidence: true }] }
    const constrained = calculateHrRoleScore({ ...input, operationalEnablement: 1 })
    const enabled = calculateHrRoleScore({ ...input, operationalEnablement: 5 })
    expect(constrained.rolePerformanceScore).toBe(enabled.rolePerformanceScore)
    expect(constrained.operationalEnablement).not.toBe(enabled.operationalEnablement)
  })

  it('never turns an unevidenced rating into coverage or score contribution', () => {
    const result = calculateHrRoleScore({ criteria: [
      { id: 'verified', weight: 70, rating: 3, hasSufficientEvidence: true },
      { id: 'unsupported-opinion', weight: 30, rating: 5, hasSufficientEvidence: false },
    ], operationalEnablement: 3 })
    expect(result).toMatchObject({ evidenceCoverage: 70, rolePerformanceScore: 3 })
  })
})
