export type VideoGenerationMode = 'text-to-video' | 'image-to-video' | 'video-extension' | 'lip-sync'

export type VideoGenerationSubjectType = 'vehicle' | 'non_vehicle' | 'unknown'

export type VideoGenerationCostUnit = 'generation' | 'second' | 'clip'

export type VideoGenerationSafetyClass =
  | 'vehicle_i2v_safe'
  | 'non_vehicle_t2v'
  | 'experimental'
  | 'disabled'

export interface VideoGenerationModel {
  id: string
  provider: string
  displayName: string
  modes: VideoGenerationMode[]
  allowedSubjectTypes: VideoGenerationSubjectType[]
  requiresApprovedSourceAsset: boolean
  supportsNativeAudio: boolean
  durationsSeconds: number[]
  aspectRatios: string[]
  resolutions: string[]
  estimatedCostCents: number
  costUnit: VideoGenerationCostUnit
  safetyClass: VideoGenerationSafetyClass
  defaultEnabled: boolean
}

export interface VideoGenerationTenantPolicy {
  enabled: boolean
  monthlyCapCents: number
  allowedModelIds?: string[]
}

export interface VideoGenerationSourceAsset {
  id: string
  approved: boolean
  subjectType: VideoGenerationSubjectType
}

export interface VideoGenerationProvenanceInput {
  userId: string
  tenantId: string
  projectId: string
  idempotencyKey: string
}

export type VideoGenerationComplianceResult =
  | {
      allowed: true
      classification: 'vehicle_i2v' | 'non_vehicle_t2v' | 'other_safe'
      reasons: string[]
    }
  | {
      allowed: false
      classification:
        | 'blocked_vehicle_t2v'
        | 'missing_approved_asset'
        | 'model_not_allowed'
        | 'missing_provenance'
        | 'disabled_model'
      reasons: string[]
    }
