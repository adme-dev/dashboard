export interface HrScoreCriterionInput {
  id: string
  weight: number
  rating: number | null
  hasSufficientEvidence: boolean
}

export interface HrRoleScoreInput {
  criteria: HrScoreCriterionInput[]
  operationalEnablement: number
  minimumEvidenceCoverage?: number
}

export type HrEvidenceConfidence = 'low' | 'medium' | 'high'

export interface HrRoleScoreResult {
  isPublishable: boolean
  rolePerformanceScore: number | null
  operationalEnablement: number
  evidenceCoverage: number
  confidence: HrEvidenceConfidence
  reason: 'INSUFFICIENT_EVIDENCE' | null
}

function round(value: number, precision = 2): number {
  const factor = 10 ** precision
  return Math.round((value + Number.EPSILON) * factor) / factor
}

export function calculateHrRoleScore(input: HrRoleScoreInput): HrRoleScoreResult {
  const totalWeight = input.criteria.reduce((sum, criterion) => sum + criterion.weight, 0)
  if (Math.abs(totalWeight - 100) > 0.01) {
    throw new Error('Scorecard weights must total 100')
  }
  if (!Number.isFinite(input.operationalEnablement) || input.operationalEnablement < 1 || input.operationalEnablement > 5) {
    throw new Error('Operational enablement must be between 1 and 5')
  }
  for (const criterion of input.criteria) {
    if (!Number.isFinite(criterion.weight) || criterion.weight < 0 || criterion.weight > 100) {
      throw new Error('Criterion weights must be between 0 and 100')
    }
    if (criterion.rating !== null && (!Number.isFinite(criterion.rating) || criterion.rating < 1 || criterion.rating > 5)) {
      throw new Error('Criterion ratings must be between 1 and 5')
    }
  }

  const evidenced = input.criteria.filter(criterion => (
    criterion.hasSufficientEvidence && criterion.rating !== null
  ))
  const evidencedWeight = evidenced.reduce((sum, criterion) => sum + criterion.weight, 0)
  const evidenceCoverage = round(evidencedWeight, 2)
  const minimumCoverage = input.minimumEvidenceCoverage ?? 70
  const isPublishable = evidenceCoverage >= minimumCoverage && evidencedWeight > 0
  const weightedScore = evidenced.reduce((sum, criterion) => (
    sum + (criterion.rating as number) * criterion.weight
  ), 0)

  return {
    isPublishable,
    rolePerformanceScore: isPublishable ? round(weightedScore / evidencedWeight) : null,
    operationalEnablement: round(input.operationalEnablement),
    evidenceCoverage,
    confidence: evidenceCoverage >= 90 ? 'high' : evidenceCoverage >= 70 ? 'medium' : 'low',
    reason: isPublishable ? null : 'INSUFFICIENT_EVIDENCE',
  }
}
