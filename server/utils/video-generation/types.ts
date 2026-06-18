export type VideoGenerationMode = 'text-to-video' | 'image-to-video' | 'video-extension' | 'lip-sync'

export type VideoGenerationSubjectType = 'vehicle' | 'non_vehicle' | 'unknown'

export type VideoGenerationCostUnit = 'generation' | 'second' | 'clip'

export interface VideoGenerationCapabilities {
  /** Continue a finished or source video beyond its current end frame. */
  extendVideo: boolean
  /** Generate from both an explicit start frame and an explicit end frame. */
  endFrame: boolean
  /** Transform an existing video into a new video, preserving temporal structure. */
  videoToVideo: boolean
}

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
  capabilities: VideoGenerationCapabilities
  safetyClass: VideoGenerationSafetyClass
  defaultEnabled: boolean
  /** Legacy-only MuAPI mapping. The active model registry is Cloudflare AI Gateway only. */
  muapi?: {
    endpoint: string            // muapi model endpoint slug, e.g. 'generate_kling_i2v'
  }
  /** Cloudflare Workers AI model id for provider==='aigateway' (the env.AI.run string). */
  cfModel?: string
  /** Where the model may be offered. 'internal' models are never tenant-selectable. */
  surface?: 'tenant' | 'internal'
  /** Generation modality (governance: tenant path is i2v-only — enforced in Slice 2B). */
  modality?: 'i2v' | 't2v' | 'i2v+t2v'
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

export type VideoGenerationJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'blocked'

export interface VideoGenerationJob {
  id: string
  tenantId: string
  projectId: string
  timelineId: string | null
  createdBy: string
  status: VideoGenerationJobStatus
  mode: VideoGenerationMode
  modelId: string
  provider: string
  prompt: string
  sourceAssetIds: string[]
  durationSeconds: number
  aspectRatio: string
  resolution: string | null
  subjectType: VideoGenerationSubjectType
  complianceStatus: string
  complianceReasons: string[]
  estimatedCostCents: number
  actualCostCents: number | null
  idempotencyKey: string
  providerRequestId: string | null
  providerStatus: string | null
  providerResultUrl: string | null
  outputAssetId: string | null
  outputR2Key: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  startedAt: string | null
  completedAt: string | null
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
