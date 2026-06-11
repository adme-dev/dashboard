export interface AiAssemblyPlanStep {
  type?: string | null
  assetId?: string | null
  r2Key?: string | null
  durationSec?: number | null
  startSec?: number | null
  title?: string | null
}

export interface AiAssemblyPlan {
  targetFormat?: string | null
  steps?: AiAssemblyPlanStep[] | null
}

export interface AiAssemblyTimelinePayload {
  assetId: string | null
  r2Key: string
  durationSec: number
  startSec: number
  title: string | null
  format: string | null
}

export function assemblyPlanToTimelinePayloads(plan: AiAssemblyPlan | null | undefined): AiAssemblyTimelinePayload[] {
  const steps = Array.isArray(plan?.steps) ? plan.steps : []
  return steps
    .filter(step => step?.type === 'place-asset' && typeof step.r2Key === 'string' && step.r2Key.length > 0)
    .map(step => ({
      assetId: step.assetId ?? null,
      r2Key: step.r2Key!,
      durationSec: typeof step.durationSec === 'number' && Number.isFinite(step.durationSec) && step.durationSec > 0 ? step.durationSec : 5,
      startSec: typeof step.startSec === 'number' && Number.isFinite(step.startSec) && step.startSec >= 0 ? step.startSec : 0,
      title: step.title ?? null,
      format: plan?.targetFormat ?? null,
    }))
}
