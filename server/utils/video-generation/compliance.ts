import type {
  VideoGenerationComplianceResult,
  VideoGenerationMode,
  VideoGenerationModel,
  VideoGenerationProvenanceInput,
  VideoGenerationSourceAsset,
  VideoGenerationSubjectType,
  VideoGenerationTenantPolicy,
} from '~~/server/utils/video-generation/types'

const VEHICLE_PROMPT_RE =
  /\b(vehicle|car|ute|suv|truck|van|stock|dealer|dealership|inventory|oem|model|trim|badge|grille|demonstrator|rego|vin|hybrid|petrol|diesel|ev|toyota|mazda|ford|mitsubishi|haval|gwm|kia|hyundai|nissan|isuzu)\b/i

export interface EvaluateVideoGenerationComplianceInput {
  mode: VideoGenerationMode
  prompt: string
  model: VideoGenerationModel
  sourceAssets: VideoGenerationSourceAsset[]
  requestedSubjectType: VideoGenerationSubjectType
  tenantPolicy: VideoGenerationTenantPolicy
  provenance: Partial<VideoGenerationProvenanceInput>
}

function hasRequiredProvenance(provenance: Partial<VideoGenerationProvenanceInput>): boolean {
  return Boolean(provenance.userId && provenance.tenantId && provenance.projectId && provenance.idempotencyKey)
}

function modelAllowed(model: VideoGenerationModel, tenantPolicy: VideoGenerationTenantPolicy): boolean {
  if (!tenantPolicy.enabled) return false
  if (!tenantPolicy.allowedModelIds?.length) return true
  return tenantPolicy.allowedModelIds.includes(model.id)
}

function isVehicleSubject(subjectType: VideoGenerationSubjectType, prompt: string): boolean {
  return subjectType === 'vehicle' || VEHICLE_PROMPT_RE.test(prompt)
}

export function evaluateVideoGenerationCompliance(
  input: EvaluateVideoGenerationComplianceInput
): VideoGenerationComplianceResult {
  const reasons: string[] = []

  if (!hasRequiredProvenance(input.provenance)) {
    return { allowed: false, classification: 'missing_provenance', reasons: ['Missing required provenance fields.'] }
  }

  if (input.model.safetyClass === 'disabled') {
    return { allowed: false, classification: 'disabled_model', reasons: ['Model is disabled for generation.'] }
  }

  if (!modelAllowed(input.model, input.tenantPolicy)) {
    return { allowed: false, classification: 'model_not_allowed', reasons: ['Model is not allowed for this tenant.'] }
  }

  // Brand safety only ever widens: the declared subject, the prompt wording, and the
  // source assets' own registered subjectType each independently make this a vehicle
  // job. The asset floor means a benign prompt rewrite can never soften the class of
  // a job that consumes a vehicle asset.
  const promptVehicle = isVehicleSubject(input.requestedSubjectType, input.prompt)
  const assetVehicle = input.sourceAssets.some((asset) => asset.subjectType === 'vehicle')
  const vehicleSubject = promptVehicle || assetVehicle
  if (vehicleSubject && input.requestedSubjectType !== 'vehicle') {
    if (assetVehicle) {
      reasons.push(`Declared subjectType '${input.requestedSubjectType}' upgraded to vehicle: a source asset is registered as a vehicle.`)
    }
    if (promptVehicle) {
      reasons.push(`Declared subjectType '${input.requestedSubjectType}' upgraded to vehicle: prompt matches vehicle policy patterns.`)
    }
  }
  if (input.mode === 'text-to-video' && vehicleSubject) {
    reasons.push('Vehicle text-to-video is blocked; use approved-asset image-to-video instead.')
    return { allowed: false, classification: 'blocked_vehicle_t2v', reasons }
  }

  if (vehicleSubject && input.mode === 'image-to-video') {
    // The brand-safety gate is approval + ownership (ownership enforced at enqueue). The
    // asset's self-declared subjectType is advisory and redundant with the request's
    // declared subject, so any approved source satisfies a vehicle i2v.
    const hasApprovedAsset = input.sourceAssets.some((asset) => asset.approved)
    if (!hasApprovedAsset) {
      reasons.push('Vehicle image-to-video requires an approved source asset.')
      return { allowed: false, classification: 'missing_approved_asset', reasons }
    }
    return { allowed: true, classification: 'vehicle_i2v', reasons: [...reasons, 'Approved source asset present.'] }
  }

  if (input.mode === 'text-to-video') {
    return { allowed: true, classification: 'non_vehicle_t2v', reasons: [...reasons, 'Non-vehicle text-to-video passed policy.'] }
  }

  return { allowed: true, classification: 'other_safe', reasons: [...reasons, 'Generation request passed policy.'] }
}
