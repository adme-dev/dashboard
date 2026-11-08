import { z } from 'zod'
import type { StoryboardPlan, StoryboardShot } from './storyboard'

const Hash = z.string().regex(/^[a-f0-9]{64}$/)
const Identity = z.string().uuid()

export const ShotProductionExecutionStateSchema = z.enum([
  'queued', 'running', 'unknown', 'ready', 'failed', 'cancelled'
])
export const ShotProductionReviewStateSchema = z.enum([
  'unreviewed', 'approved', 'rejected', 'stale'
])
export const ShotProductionStageSchema = z.enum([
  'not_started', 'queued', 'running', 'unknown', 'needs_review',
  'approved', 'rejected', 'failed', 'cancelled'
])

export type ShotProductionExecutionState = z.infer<typeof ShotProductionExecutionStateSchema>
export type ShotProductionReviewState = z.infer<typeof ShotProductionReviewStateSchema>
export type ShotProductionStage = z.infer<typeof ShotProductionStageSchema>

export const ReserveShotProductionRequestSchema = z.object({
  projectId: Identity,
  shotId: Identity,
  expectedRevision: Identity,
  operationId: Identity,
  modelId: z.string().min(1).max(200),
  sourceAssetIds: z.array(Identity).max(1).default([]),
  prompt: z.string().min(1).max(4000).refine(value => value.trim().length > 0).optional()
}).strict()

export const ShotProductionRevisionPinSchema = z.object({
  storyboardRevisionId: Identity,
  referenceSetId: Identity,
  planHash: Hash,
  copyHash: Hash,
  sourceHash: Hash,
  referenceContentHash: Hash,
  shotHash: Hash
}).strict()

export const ApproveShotProductionRequestSchema = z.object({
  projectId: Identity,
  attemptId: Identity,
  expectedRevision: Identity,
  expectedShotRevision: z.object({
    revisionId: Identity,
    shotHash: Hash
  }).strict(),
  artifactHash: Hash.optional()
}).strict()

export const CancelShotProductionRequestSchema = z.object({
  projectId: Identity,
  attemptId: Identity
}).strict()

export const SetShotProductionAllowanceRequestSchema = z.object({
  projectId: Identity,
  allowanceCents: z.number().int().min(0).max(1_000_000_000)
}).strict()

export const ShotProductionSourcePinSchema = z.object({
  assetId: Identity,
  role: z.enum(['product', 'presenter', 'location', 'style']),
  contentHash: Hash
}).strict()

export const ShotProductionNormalizedRequestSchema = z.object({
  schemaVersion: z.literal(1),
  tenantId: z.string().min(1),
  projectId: Identity,
  actorId: Identity,
  operationId: Identity,
  storyboardRevisionId: Identity,
  referenceSetId: Identity,
  shotId: Identity,
  planHash: Hash,
  copyHash: Hash,
  sourceHash: Hash,
  referenceContentHash: Hash,
  shotHash: Hash,
  recipeId: z.string().nullable(),
  recipeVersion: z.number().int().positive().nullable(),
  modelId: z.string().min(1),
  provider: z.string().min(1),
  providerModelRevision: z.null(),
  actualSeed: z.null(),
  mode: z.literal('image-to-video'),
  prompt: z.string().min(1).max(4000),
  sourcePins: z.array(ShotProductionSourcePinSchema).length(1),
  durationSeconds: z.number().int().positive(),
  aspectRatio: z.string().min(1),
  resolution: z.string().nullable(),
  subjectType: z.enum(['vehicle', 'non_vehicle']),
  complianceStatus: z.string().min(1),
  complianceReasons: z.array(z.string()),
  currency: z.literal('USD'),
  estimatedCents: z.number().int().nonnegative()
}).strict()

export type ReserveShotProductionRequest = z.infer<typeof ReserveShotProductionRequestSchema>
export type ApproveShotProductionRequest = z.infer<typeof ApproveShotProductionRequestSchema>
export type CancelShotProductionRequest = z.infer<typeof CancelShotProductionRequestSchema>
export type ShotProductionRevisionPin = z.infer<typeof ShotProductionRevisionPinSchema>
export type ShotProductionNormalizedRequest = z.infer<typeof ShotProductionNormalizedRequestSchema>

export interface ShotProductionAttempt {
  id: string
  projectId: string
  jobId: string
  providerRequestId: string | null
  shotId: string
  storyboardRevisionId: string
  referenceSetId: string
  planHash: string
  copyHash: string
  sourceHash: string
  referenceContentHash: string
  shotHash: string
  operationId: string
  requestHash: string
  requestFingerprint: string
  requestSnapshot: ShotProductionNormalizedRequest
  modelId: string
  provider: string
  providerModelRevision: string | null
  actualSeed: string | null
  recipeId: string | null
  recipeVersion: number | null
  currency: 'USD'
  estimatedCents: number
  reportedCents: number | null
  liabilityState: string
  liabilityCents: number
  executionState: ShotProductionExecutionState
  reviewState: ShotProductionReviewState
  stage: ShotProductionStage
  artifactSha256: string | null
  jobStatus: string
  submissionAttemptedAt: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  readyAt: string | null
  cancelledAt: string | null
  reviewedAt: string | null
}

export interface ShotProductionApproval {
  id: string
  attemptId: string
  artifactRole: 'final_video'
  artifactSha256: string
  storyboardRevisionId: string
  referenceSetId: string
  planHash: string
  copyHash: string
  sourceHash: string
  referenceContentHash: string
  shotHash: string
  actorId: string
  createdAt: string
}

export function normalizeShotProductionOperationBody(
  input: ReserveShotProductionRequest & { actorId: string }
) {
  return {
    schemaVersion: 1 as const,
    projectId: input.projectId,
    actorId: input.actorId,
    shotId: input.shotId,
    expectedRevision: input.expectedRevision,
    operationId: input.operationId,
    modelId: input.modelId,
    sourceAssetIds: [...input.sourceAssetIds],
    prompt: input.prompt ?? null
  }
}

export function shotProductionDurationSeconds(
  shot: Pick<StoryboardShot, 'durationFrames'>,
  fps: StoryboardPlan['fps'],
  supportedDurations: readonly number[]
): number | null {
  if (!Number.isInteger(fps) || fps <= 0 || shot.durationFrames % fps !== 0) return null
  const durationSeconds = shot.durationFrames / fps
  return supportedDurations.includes(durationSeconds) ? durationSeconds : null
}

export function deriveShotProductionStage(
  executionState: ShotProductionExecutionState,
  reviewState: ShotProductionReviewState
): ShotProductionStage {
  if (reviewState === 'approved') return 'approved'
  if (reviewState === 'rejected') return 'rejected'
  if (executionState === 'ready') return 'needs_review'
  return executionState
}

export function isShotProductionPinCurrent(
  pinned: ShotProductionRevisionPin,
  current: ShotProductionRevisionPin
): boolean {
  return pinned.storyboardRevisionId === current.storyboardRevisionId
    && pinned.referenceSetId === current.referenceSetId
    && pinned.planHash === current.planHash
    && pinned.copyHash === current.copyHash
    && pinned.sourceHash === current.sourceHash
    && pinned.referenceContentHash === current.referenceContentHash
    && pinned.shotHash === current.shotHash
}

export interface ShotProductionArtifactEvidence {
  jobId: string
  jobStatus: string
  jobOutputAssetId: string | null
  jobOutputR2Key: string | null
  assetId: string | null
  assetSourceJobId: string | null
  assetR2Key: string | null
  artifactSha256: string | null
}

/** Only server-persisted finalizer evidence qualifies; no caller artifact hash is read here. */
export function verifiedShotProductionArtifactHash(
  evidence: ShotProductionArtifactEvidence
): string | null {
  if (evidence.jobStatus !== 'succeeded') return null
  if (!evidence.jobOutputAssetId || evidence.jobOutputAssetId !== evidence.assetId) return null
  if (evidence.assetSourceJobId !== evidence.jobId) return null
  if (!evidence.jobOutputR2Key || evidence.jobOutputR2Key !== evidence.assetR2Key) return null
  return evidence.artifactSha256 && /^[a-f0-9]{64}$/.test(evidence.artifactSha256)
    ? evidence.artifactSha256
    : null
}
