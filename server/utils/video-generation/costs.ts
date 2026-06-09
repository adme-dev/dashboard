import type { VideoGenerationModel, VideoGenerationTenantPolicy } from '~~/server/utils/video-generation/types'

export interface VideoGenerationSpendDecision {
  allowed: boolean
  reason: 'allowed' | 'tenant_generation_disabled' | 'tenant_cap_exceeded'
  remainingCents: number
}

export function estimateVideoGenerationCostCents(model: VideoGenerationModel, durationSeconds: number): number {
  if (model.costUnit === 'second') return model.estimatedCostCents * durationSeconds
  return model.estimatedCostCents
}

export function canSpendVideoGenerationCents(
  policy: VideoGenerationTenantPolicy | null | undefined,
  currentSpendCents: number,
  estimateCents: number
): VideoGenerationSpendDecision {
  if (!policy?.enabled) {
    return { allowed: false, reason: 'tenant_generation_disabled', remainingCents: 0 }
  }

  const remainingCents = Math.max(0, policy.monthlyCapCents - currentSpendCents)
  if (estimateCents > remainingCents) {
    return { allowed: false, reason: 'tenant_cap_exceeded', remainingCents }
  }

  return { allowed: true, reason: 'allowed', remainingCents }
}
