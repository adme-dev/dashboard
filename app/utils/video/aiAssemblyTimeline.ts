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
  rationale?: string | null
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

export interface AiAssemblyPlanSkippedStep {
  index: number
  title: string
  reason: string
}

export interface AiAssemblyPlanValidation {
  canApply: boolean
  timelineReadyCount: number
  skippedCount: number
  warnings: string[]
  skippedSteps: AiAssemblyPlanSkippedStep[]
}

function stepTitle(step: AiAssemblyPlanStep, index: number): string {
  return step.title || step.r2Key || step.assetId || step.type || `Step ${index + 1}`
}

function skippedStepReason(step: AiAssemblyPlanStep): string | null {
  switch (step?.type) {
    case 'place-asset':
      if (typeof step.r2Key !== 'string' || step.r2Key.length === 0) return 'missing r2 key'
      return null
    case 'place-voiceover':
      return 'voiceover placement is reviewed before audio lane insertion'
    case 'place-overlay':
      return 'overlay placement is reviewed before overlay lane insertion'
    case 'create-caption':
    case 'caption':
      return 'caption requirements are reviewed before caption lane insertion'
    default:
      return `${step?.type || 'unknown'} steps are reviewed but not auto-applied from producer plans yet`
  }
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

export function validateAssemblyPlanForTimeline(plan: AiAssemblyPlan | null | undefined): AiAssemblyPlanValidation {
  const steps = Array.isArray(plan?.steps) ? plan.steps : []
  const timelineReadyCount = assemblyPlanToTimelinePayloads(plan).length
  const skippedSteps = steps
    .map((step, index) => {
      const reason = skippedStepReason(step)
      return reason ? { index, title: stepTitle(step, index), reason } : null
    })
    .filter((step): step is AiAssemblyPlanSkippedStep => Boolean(step))

  const warnings: string[] = []
  if (timelineReadyCount === 0) warnings.push('No visual clips are ready to add to the timeline.')
  if (skippedSteps.length > 0) {
    warnings.push(`${skippedSteps.length} draft ${skippedSteps.length === 1 ? 'step needs' : 'steps need'} manual placement or generation.`)
  }

  return {
    canApply: timelineReadyCount > 0,
    timelineReadyCount,
    skippedCount: skippedSteps.length,
    warnings,
    skippedSteps,
  }
}
