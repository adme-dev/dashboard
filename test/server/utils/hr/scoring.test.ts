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
})
