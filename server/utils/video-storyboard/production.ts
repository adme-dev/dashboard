import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { transaction } from '~~/server/utils/db'
import type { GodModeTransactionDb } from '~~/server/utils/godMode/transactionCoordinator'
import type { MediaProjectActor } from '~~/server/utils/audio/projects'
import { reserveAndCreateVideoGenerationJobIn } from '~~/server/utils/video-generation/budget'
import { loadTenantVideoGenerationPolicy } from '~~/server/utils/video-generation/policy'
import { getVideoGenerationModel } from '~~/server/utils/video-generation/modelRegistry'
import { isTenantModel } from '~~/server/utils/video-generation/surface'
import { evaluateVideoGenerationCompliance } from '~~/server/utils/video-generation/compliance'
import { estimateVideoGenerationCostCents } from '~~/server/utils/video-generation/costs'
import { assertResolvableSources } from '~~/server/utils/video-generation/sourceAssetStore'
import type { VideoGenerationSourceAsset, VideoGenerationSubjectType } from '~~/server/utils/video-generation/types'
import {
  ApproveShotProductionRequestSchema,
  CancelShotProductionRequestSchema,
  ReserveShotProductionRequestSchema,
  ShotProductionNormalizedRequestSchema,
  deriveShotProductionStage,
  isShotProductionPinCurrent,
  normalizeShotProductionOperationBody,
  shotProductionDurationSeconds,
  verifiedShotProductionArtifactHash,
  type ApproveShotProductionRequest,
  type CancelShotProductionRequest,
  type ReserveShotProductionRequest,
  type ShotProductionAttempt,
  type ShotProductionNormalizedRequest,
  type ShotProductionRevisionPin
} from '~~/shared/video/storyboardProduction'
import type { StoryboardShot } from '~~/shared/video/storyboard'
import type { StoryboardReferenceSet } from '~~/shared/video/storyboardReferences'
import { requireStoryboardProjectIn, type StoryboardProject } from './access'
import { getStoryboardIn } from './store'
import { checkReferencesIn, type ReferenceDependencies } from './references'
import { fenceDependenciesIn, fenceWriteAuthorityIn } from './apply'
import { storyboardHash } from './hash'
import {
  getProjectProductionAllowanceIn,
  lockStoryboardProductionBudgetIn
} from './productionBudget'
import {
  requireActiveProductionTenantIn,
  requireFreshProductionActorIn
} from './productionPolicy'

const ATTEMPT_SELECT = `
  SELECT a.*,
         j.status AS job_status,
         j.actual_cost_cents AS job_actual_cost_cents,
         j.liability_state AS job_liability_state,
         j.liability_cents AS job_liability_cents,
         j.submission_attempted_at AS job_submission_attempted_at,
         j.provider_request_id AS job_provider_request_id,
         j.output_asset_id AS job_output_asset_id,
         j.output_r2_key AS job_output_r2_key,
         j.output_sha256 AS job_output_sha256,
         va.id AS asset_id,
         va.source_job_id AS asset_source_job_id,
         va.r2_key AS asset_r2_key
    FROM video_storyboard_shot_attempts a
    JOIN video_generation_jobs j ON j.id = a.job_id
    LEFT JOIN video_assets va ON va.id = j.output_asset_id`

const conflict = (message: string) => createError({ statusCode: 409, statusMessage: message })
const invalid = (message: string) => createError({ statusCode: 400, statusMessage: message })

export interface ShotProductionDependencies extends ReferenceDependencies {
  loadTenantPolicy?: typeof loadTenantVideoGenerationPolicy
  getModel?: typeof getVideoGenerationModel
  estimateCost?: typeof estimateVideoGenerationCostCents
  reserveJob?: typeof reserveAndCreateVideoGenerationJobIn
  randomUUID?: () => string
}

export type ReserveShotAttemptInput = ReserveShotProductionRequest & {
  actor: MediaProjectActor
  /** Server coordinator receipt identity; never accepted in the public request schema. */
  attemptId?: string
}
export type ApproveShotArtifactInput = ApproveShotProductionRequest & { actor: MediaProjectActor }
export type CancelShotAttemptInput = CancelShotProductionRequest & { actor: MediaProjectActor }

export function shotProductionOperationRequestHash(
  input: ReserveShotProductionRequest & { actorId: string }
): string {
  return storyboardHash(normalizeShotProductionOperationBody(input))
}

export function shotProductionRequestFingerprint(request: ShotProductionNormalizedRequest): string {
  return storyboardHash(request)
}

function parsedJson(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) : value
}

interface ProductionAttemptRow {
  id: string
  project_id: string
  job_id: string
  shot_id: string
  storyboard_revision_id: string
  reference_set_id: string
  plan_hash: string
  copy_hash: string
  source_hash: string
  reference_content_hash: string
  shot_hash: string
  operation_id: string
  request_hash: string
  request_fingerprint: string
  model_id: string
  provider: string
  created_by: string
  created_at: string
  updated_at: string
  job_status: string
  job_liability_state: string
  job_provider_request_id?: string | null
  provider_model_revision?: string | null
  actual_seed?: string | null
  recipe_id?: string | null
  job_output_sha256?: string | null
  job_output_asset_id?: string | null
  job_output_r2_key?: string | null
  asset_id?: string | null
  asset_source_job_id?: string | null
  asset_r2_key?: string | null
  job_submission_attempted_at?: string | null
  ready_at?: string | null
  cancelled_at?: string | null
  reviewed_at?: string | null
  artifact_sha256?: string | null
  execution_state: ShotProductionAttempt['executionState']
  review_state: ShotProductionAttempt['reviewState']
  request_snapshot: unknown
  recipe_version?: number | string | null
  estimated_cents: number | string
  job_actual_cost_cents?: number | string | null
  job_liability_cents?: number | string | null
}

export function mapShotProductionAttemptRow(row: ProductionAttemptRow | undefined): ShotProductionAttempt {
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Production attempt not found' })
  const executionState = row.execution_state
  const reviewState = row.review_state
  return {
    id: row.id,
    projectId: row.project_id,
    jobId: row.job_id,
    providerRequestId: row.job_provider_request_id ?? null,
    shotId: row.shot_id,
    storyboardRevisionId: row.storyboard_revision_id,
    referenceSetId: row.reference_set_id,
    planHash: row.plan_hash,
    copyHash: row.copy_hash,
    sourceHash: row.source_hash,
    referenceContentHash: row.reference_content_hash,
    shotHash: row.shot_hash,
    operationId: row.operation_id,
    requestHash: row.request_hash,
    requestFingerprint: row.request_fingerprint,
    requestSnapshot: ShotProductionNormalizedRequestSchema.parse(parsedJson(row.request_snapshot)),
    modelId: row.model_id,
    provider: row.provider,
    providerModelRevision: row.provider_model_revision ?? null,
    actualSeed: row.actual_seed ?? null,
    recipeId: row.recipe_id ?? null,
    recipeVersion: row.recipe_version == null ? null : Number(row.recipe_version),
    currency: 'USD',
    estimatedCents: Number(row.estimated_cents),
    reportedCents: row.job_actual_cost_cents == null ? null : Number(row.job_actual_cost_cents),
    liabilityState: row.job_liability_state,
    liabilityCents: Number(row.job_liability_cents ?? 0),
    executionState,
    reviewState,
    stage: deriveShotProductionStage(executionState, reviewState),
    artifactSha256: row.job_output_sha256 ?? null,
    jobStatus: row.job_status,
    submissionAttemptedAt: row.job_submission_attempted_at ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    readyAt: row.ready_at ?? null,
    cancelledAt: row.cancelled_at ?? null,
    reviewedAt: row.reviewed_at ?? null
  }
}

async function loadAttemptRowIn(
  db: GodModeTransactionDb,
  projectId: string,
  attemptId: string,
  lock = false
): Promise<ProductionAttemptRow | undefined> {
  return (await db.query(
    `${ATTEMPT_SELECT}
      WHERE a.project_id = $1 AND a.id = $2${lock ? ' FOR UPDATE OF a, j' : ''}`,
    [projectId, attemptId]
  )).rows[0]
}

function canonicalShotProductionArtifactHash(row: ProductionAttemptRow): string | null {
  return verifiedShotProductionArtifactHash({
    jobId: row.job_id,
    jobStatus: row.job_status,
    jobOutputAssetId: row.job_output_asset_id ?? null,
    jobOutputR2Key: row.job_output_r2_key ?? null,
    assetId: row.asset_id ?? null,
    assetSourceJobId: row.asset_source_job_id ?? null,
    assetR2Key: row.asset_r2_key ?? null,
    artifactSha256: row.job_output_sha256 ?? null
  })
}

async function synchronizeShotProductionAttemptStateIn(
  db: GodModeTransactionDb,
  row: ProductionAttemptRow
): Promise<ProductionAttemptRow> {
  if (!['queued', 'running', 'unknown'].includes(row.execution_state)) return row
  if (!canonicalShotProductionArtifactHash(row)) {
    const executionState = row.job_status === 'blocked' ? 'failed' : row.job_status
    if (!['running', 'unknown', 'failed'].includes(executionState) || executionState === row.execution_state) return row
    const updated = (await db.query(
      `UPDATE video_storyboard_shot_attempts
          SET execution_state = $2, updated_at = now()
        WHERE id = $1 AND execution_state IN ('queued', 'running', 'unknown')
        RETURNING updated_at`,
      [row.id, executionState]
    )).rows[0]
    return updated
      ? { ...row, execution_state: executionState as ProductionAttemptRow['execution_state'], updated_at: updated.updated_at }
      : row
  }
  const updated = (await db.query(
    `UPDATE video_storyboard_shot_attempts
        SET execution_state = 'ready', ready_at = COALESCE(ready_at, now()), updated_at = now()
      WHERE id = $1 AND execution_state IN ('queued', 'running', 'unknown')
      RETURNING ready_at, updated_at`,
    [row.id]
  )).rows[0]
  return updated
    ? { ...row, execution_state: 'ready', ready_at: updated.ready_at, updated_at: updated.updated_at }
    : row
}

async function loadAttemptByOperationIn(
  db: GodModeTransactionDb,
  projectId: string,
  operationId: string
): Promise<ProductionAttemptRow | undefined> {
  return (await db.query(
    `${ATTEMPT_SELECT} WHERE a.project_id = $1 AND a.operation_id = $2`,
    [projectId, operationId]
  )).rows[0]
}

export async function getShotProductionAttemptIn(
  db: GodModeTransactionDb,
  input: { projectId: string, attemptId: string, actor: MediaProjectActor }
): Promise<ShotProductionAttempt> {
  const actor = await requireFreshProductionActorIn(db, input.actor)
  const project = await requireStoryboardProjectIn(db, input.projectId, actor, true)
  await requireActiveProductionTenantIn(db, project.clientId)
  const row = await loadAttemptRowIn(db, project.id, input.attemptId, true)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Production attempt not found' })
  return mapShotProductionAttemptRow(await synchronizeShotProductionAttemptStateIn(db, row))
}

export function getShotProductionAttempt(
  input: { projectId: string, attemptId: string, actor: MediaProjectActor }
): Promise<ShotProductionAttempt> {
  return transaction(db => getShotProductionAttemptIn(db, input))
}

interface CurrentProductionContext {
  revision: NonNullable<Awaited<ReturnType<typeof getStoryboardIn>>['revision']>
  referenceSet: StoryboardReferenceSet
  shot: StoryboardShot
  pin: ShotProductionRevisionPin
}

async function loadCurrentProductionContextIn(
  db: GodModeTransactionDb,
  input: {
    project: StoryboardProject
    actor: MediaProjectActor
    expectedRevision: string
    shotId: string
  },
  deps: ShotProductionDependencies
): Promise<CurrentProductionContext> {
  const saved = await getStoryboardIn(db, input.project.id, input.actor)
  const revision = saved.revision
  const referenceSet = saved.referenceSet
  if (!saved.storyboard || !revision || !referenceSet
    || saved.storyboard.currentRevisionId !== input.expectedRevision
    || revision.id !== input.expectedRevision
    || saved.storyboard.currentReferenceSetId !== revision.referenceSetId
    || referenceSet.id !== revision.referenceSetId
    || revision.plan.referenceSetRevisionId !== referenceSet.id) {
    throw conflict('Storyboard revision or reference pointer changed; reload before production')
  }

  const copyHash = storyboardHash({
    scriptSegments: revision.plan.copy.scriptSegments,
    cues: revision.plan.copy.cues
  })
  if (!revision.plan.copy.approval
    || revision.plan.copy.contentHash !== copyHash
    || revision.copyHash !== copyHash
    || revision.plan.copy.approval.contentHash !== copyHash) {
    throw conflict('Approved storyboard copy is required for production')
  }

  const shot = revision.plan.shots.find(candidate => candidate.id === input.shotId)
  if (!shot) throw conflict('Selected shot no longer exists in the current storyboard revision')
  const findings = await checkReferencesIn(db, input.project, input.actor, referenceSet, deps)
  if (findings.some(finding => finding.severity === 'blocker')) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Storyboard references are stale, revoked or unavailable',
      data: { codes: findings.map(finding => finding.code) }
    })
  }
  await fenceWriteAuthorityIn(db, input.actor)
  await fenceDependenciesIn(db, saved, input.actor)
  const fencedFindings = await checkReferencesIn(db, input.project, input.actor, referenceSet, deps)
  if (fencedFindings.some(finding => finding.severity === 'blocker')) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Storyboard references are stale, revoked or unavailable',
      data: { codes: fencedFindings.map(finding => finding.code) }
    })
  }

  return {
    revision,
    referenceSet,
    shot,
    pin: {
      storyboardRevisionId: revision.id,
      referenceSetId: referenceSet.id,
      planHash: revision.planHash,
      copyHash: revision.copyHash,
      sourceHash: revision.sourceHash,
      referenceContentHash: referenceSet.contentHash,
      shotHash: storyboardHash(shot)
    }
  }
}

function selectSourceReference(
  shot: StoryboardShot,
  referenceSet: StoryboardReferenceSet,
  requestedIds: string[]
) {
  const candidates = referenceSet.references.filter(reference =>
    reference.sourceKind === 'source_asset'
    && shot.referenceRoles.includes(reference.role)
    && reference.decision === 'approved'
    && reference.approval?.contentHash === reference.contentHash
  )
  const selectedId = requestedIds[0] ?? (() => {
    const visual = shot.visual
    if (visual.status === 'bound' && visual.sourceKind === 'source_asset'
      && candidates.some(reference => reference.assetId === visual.assetId)) {
      return visual.assetId
    }
    return candidates.length === 1 ? candidates[0]!.assetId : undefined
  })()
  if (!selectedId) throw invalid('Select exactly one approved source image assigned to this shot')
  const reference = candidates.find(candidate => candidate.assetId === selectedId)
  if (!reference) throw invalid('Selected source is not an approved reference assigned to this shot')
  return reference
}

async function loadGenerationSourceIn(
  db: GodModeTransactionDb,
  tenantId: string,
  sourceAssetId: string
): Promise<VideoGenerationSourceAsset> {
  const rows = (await db.query('SELECT * FROM video_gen_source_assets WHERE id = $1', [sourceAssetId])).rows
  try {
    const [row] = assertResolvableSources(rows, [sourceAssetId], tenantId)
    if (!row) throw new Error('Generation source missing')
    return {
      id: row.id,
      approved: row.status === 'approved',
      subjectType: (row.subject_type as VideoGenerationSubjectType) ?? 'unknown'
    }
  } catch {
    throw conflict('Selected generation source is no longer approved or available to this tenant')
  }
}

function productionAspectRatio(format: 'reels_9x16' | 'youtube_16x9' | 'square_1x1'): string {
  if (format === 'reels_9x16') return '9:16'
  if (format === 'youtube_16x9') return '16:9'
  return '1:1'
}

function productionResolution(resolutions: string[]): string | null {
  return resolutions.find(value => value.toLowerCase() === '720p') ?? resolutions[0] ?? null
}

export async function reserveShotAttemptIn(
  db: GodModeTransactionDb,
  input: ReserveShotAttemptInput,
  deps: ShotProductionDependencies = {}
): Promise<ShotProductionAttempt> {
  const parsed = ReserveShotProductionRequestSchema.safeParse({
    projectId: input.projectId,
    shotId: input.shotId,
    expectedRevision: input.expectedRevision,
    operationId: input.operationId,
    modelId: input.modelId,
    sourceAssetIds: input.sourceAssetIds,
    prompt: input.prompt
  })
  if (!parsed.success || (input.attemptId && !/^[0-9a-f-]{36}$/i.test(input.attemptId))) {
    throw invalid('Invalid storyboard production request')
  }
  const request = parsed.data
  const actor = await requireFreshProductionActorIn(db, input.actor)
  const unlocked = await requireStoryboardProjectIn(db, request.projectId, actor)
  const tenantId = unlocked.clientId ?? 'agency'

  await lockStoryboardProductionBudgetIn(db, tenantId)
  const project = await requireStoryboardProjectIn(db, request.projectId, actor, true)
  if (project.clientId !== unlocked.clientId) {
    throw conflict('Project client changed; reload before production')
  }
  await requireActiveProductionTenantIn(db, project.clientId)

  const requestHash = shotProductionOperationRequestHash({ ...request, actorId: actor.id })
  const replay = await loadAttemptByOperationIn(db, project.id, request.operationId)
  if (replay) {
    if (replay.request_hash !== requestHash) {
      throw conflict('Production operation ID was reused with a different request')
    }
    const replayedAttempt = mapShotProductionAttemptRow(replay)
    if (replayedAttempt.requestSnapshot.tenantId !== tenantId) throw conflict('Production attempt belongs to the previous project client')
    return replayedAttempt
  }

  const current = await loadCurrentProductionContextIn(db, {
    project,
    actor,
    expectedRevision: request.expectedRevision,
    shotId: request.shotId
  }, deps)
  const sourceReference = selectSourceReference(current.shot, current.referenceSet, request.sourceAssetIds)
  const sourceAssets = [await loadGenerationSourceIn(db, tenantId, sourceReference.assetId)]
  const getModel = deps.getModel ?? getVideoGenerationModel
  const model = getModel(request.modelId)
  if (!model || !isTenantModel(model)) throw createError({ statusCode: 404, statusMessage: 'Production model not found' })
  if (!model.modes.includes('image-to-video')) throw invalid('Production model does not support image-to-video')

  const durationSeconds = shotProductionDurationSeconds(
    current.shot,
    current.revision.plan.fps,
    model.durationsSeconds
  )
  if (durationSeconds === null) {
    throw conflict('Shot frames/fps do not exactly match a supported model duration')
  }
  const aspectRatio = productionAspectRatio(current.revision.plan.targetFormat)
  const resolution = productionResolution(model.resolutions)
  if (!model.aspectRatios.includes(aspectRatio) || (resolution && !model.resolutions.includes(resolution))) {
    throw conflict('Production model does not support the storyboard format')
  }

  const prompt = request.prompt ?? current.shot.visualDirection
  if (!prompt.trim()) throw invalid('Shot has no production prompt')
  if (prompt.length > 4000) throw invalid('Shot production prompt exceeds 4000 characters')
  const idempotencyKey = `storyboard-production:${project.id}:${request.operationId}`
  const tenantPolicy = await (deps.loadTenantPolicy ?? loadTenantVideoGenerationPolicy)(tenantId)
  const initialSubject: VideoGenerationSubjectType = sourceAssets.some(asset => asset.subjectType === 'vehicle')
    ? 'vehicle'
    : 'non_vehicle'
  const compliance = evaluateVideoGenerationCompliance({
    mode: 'image-to-video',
    prompt,
    model,
    sourceAssets,
    requestedSubjectType: initialSubject,
    tenantPolicy,
    provenance: { userId: actor.id, tenantId, projectId: project.id, idempotencyKey }
  })
  if (!compliance.allowed) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Storyboard production is blocked by generation policy',
      data: { classification: compliance.classification, reasons: compliance.reasons }
    })
  }
  const subjectType = compliance.classification === 'vehicle_i2v' ? 'vehicle' : 'non_vehicle'
  if (!model.allowedSubjectTypes.includes(subjectType)) throw conflict('Production model does not support the resolved subject')
  const estimatedCents = (deps.estimateCost ?? estimateVideoGenerationCostCents)(model, durationSeconds)
  if (!Number.isInteger(estimatedCents) || estimatedCents < 0) throw new Error('Invalid canonical production quote')

  const normalizedRequest = ShotProductionNormalizedRequestSchema.parse({
    schemaVersion: 1,
    tenantId,
    projectId: project.id,
    actorId: actor.id,
    operationId: request.operationId,
    ...current.pin,
    shotId: current.shot.id,
    recipeId: current.revision.plan.recipe?.id ?? null,
    recipeVersion: current.revision.plan.recipe?.version ?? null,
    modelId: model.id,
    provider: model.provider,
    providerModelRevision: null,
    actualSeed: null,
    mode: 'image-to-video',
    prompt,
    sourcePins: [{
      assetId: sourceReference.assetId,
      role: sourceReference.role,
      contentHash: sourceReference.contentHash
    }],
    durationSeconds,
    aspectRatio,
    resolution,
    subjectType,
    complianceStatus: compliance.classification,
    complianceReasons: compliance.reasons,
    currency: 'USD',
    estimatedCents
  } satisfies ShotProductionNormalizedRequest)
  const requestFingerprint = shotProductionRequestFingerprint(normalizedRequest)
  const allowance = await getProjectProductionAllowanceIn(db, project.id)
  const reserveJob = deps.reserveJob ?? reserveAndCreateVideoGenerationJobIn
  const reservation = await reserveJob(db, {
    tenantId,
    projectId: project.id,
    timelineId: null,
    createdBy: actor.id,
    status: 'queued',
    mode: 'image-to-video',
    modelId: model.id,
    provider: model.provider,
    prompt,
    sourceAssetIds: [sourceReference.assetId],
    durationSeconds,
    aspectRatio,
    resolution,
    subjectType,
    complianceStatus: compliance.classification,
    complianceReasons: compliance.reasons,
    estimatedCostCents: estimatedCents,
    idempotencyKey,
    dispatchEligible: false,
    projectAllowanceCents: allowance.allowanceCents
  }, tenantPolicy)
  if (!reservation.ok || !reservation.job) {
    if (reservation.reason === 'idempotency_key_conflict') {
      throw conflict('Production operation conflicts with an existing generation request')
    }
    throw createError({
      statusCode: 402,
      statusMessage: allowance.configured
        ? 'Storyboard production budget unavailable'
        : 'Project production allowance is required',
      data: { reason: reservation.reason, remainingCents: reservation.remainingCents ?? 0 }
    })
  }

  const attemptId = input.attemptId ?? (deps.randomUUID ?? randomUUID)()
  await db.query(
    `INSERT INTO video_storyboard_shot_attempts (
       id, job_id, project_id, shot_id, storyboard_revision_id, reference_set_id,
       plan_hash, copy_hash, source_hash, reference_content_hash, shot_hash,
       operation_id, request_hash, request_fingerprint, request_snapshot,
       model_id, provider, provider_model_revision, actual_seed, recipe_id, recipe_version,
       currency, estimated_cents, execution_state, review_state, artifact_sha256, created_by
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27
     )`,
    [
      attemptId,
      reservation.job.id,
      project.id,
      current.shot.id,
      current.pin.storyboardRevisionId,
      current.pin.referenceSetId,
      current.pin.planHash,
      current.pin.copyHash,
      current.pin.sourceHash,
      current.pin.referenceContentHash,
      current.pin.shotHash,
      request.operationId,
      requestHash,
      requestFingerprint,
      JSON.stringify(normalizedRequest),
      model.id,
      model.provider,
      null,
      null,
      normalizedRequest.recipeId,
      normalizedRequest.recipeVersion,
      'USD',
      estimatedCents,
      'queued',
      'unreviewed',
      null,
      actor.id
    ]
  )
  const row = await loadAttemptRowIn(db, project.id, attemptId)
  if (!row) throw new Error('Production attempt insert did not return durable state')
  return mapShotProductionAttemptRow(row)
}

export function reserveShotAttempt(
  input: ReserveShotAttemptInput,
  deps: ShotProductionDependencies = {}
): Promise<ShotProductionAttempt> {
  return transaction(db => reserveShotAttemptIn(db, input, deps))
}

function attemptPin(attempt: ShotProductionAttempt): ShotProductionRevisionPin {
  return {
    storyboardRevisionId: attempt.storyboardRevisionId,
    referenceSetId: attempt.referenceSetId,
    planHash: attempt.planHash,
    copyHash: attempt.copyHash,
    sourceHash: attempt.sourceHash,
    referenceContentHash: attempt.referenceContentHash,
    shotHash: attempt.shotHash
  }
}

export async function approveShotArtifactIn(
  db: GodModeTransactionDb,
  input: ApproveShotArtifactInput,
  deps: ShotProductionDependencies = {}
): Promise<ShotProductionAttempt> {
  const parsed = ApproveShotProductionRequestSchema.safeParse({
    projectId: input.projectId,
    attemptId: input.attemptId,
    expectedRevision: input.expectedRevision,
    expectedShotRevision: input.expectedShotRevision,
    artifactHash: input.artifactHash
  })
  if (!parsed.success) throw invalid('Invalid artifact approval request')
  const request = parsed.data
  const actor = await requireFreshProductionActorIn(db, input.actor)
  const project = await requireStoryboardProjectIn(db, request.projectId, actor, true)
  await requireActiveProductionTenantIn(db, project.clientId)
  const row = await loadAttemptRowIn(db, project.id, request.attemptId, true)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Production attempt not found' })
  const synchronizedRow = await synchronizeShotProductionAttemptStateIn(db, row)
  const attempt = mapShotProductionAttemptRow(synchronizedRow)
  if (attempt.jobStatus !== 'succeeded') throw conflict('Canonical generation has not succeeded')
  const artifactHash = canonicalShotProductionArtifactHash(synchronizedRow)
  if (!artifactHash) throw conflict('artifact evidence unavailable')
  if (attempt.executionState !== 'ready') throw conflict('Artifact is not ready for review')
  if (attempt.requestSnapshot.tenantId !== (project.clientId ?? 'agency')) {
    throw conflict('Production attempt belongs to the previous project client')
  }
  // A job lock alone does not fence edits to the linked library asset.
  const artifact = (await db.query(
    `SELECT id FROM video_assets
      WHERE id = $1 AND source_job_id = $2 AND source_project_id = $3
        AND r2_key = $4 AND client_id IS NOT DISTINCT FROM $5::uuid
        AND generated_output_sha256 = $6
      FOR SHARE`,
    [synchronizedRow.job_output_asset_id, attempt.jobId, project.id,
      synchronizedRow.job_output_r2_key, project.clientId, artifactHash]
  )).rows[0]
  if (!artifact) throw conflict('Canonical output asset identity or scope changed')

  if (request.artifactHash && request.artifactHash !== artifactHash) {
    throw conflict('Requested artifact does not match durable output evidence')
  }

  const current = await loadCurrentProductionContextIn(db, {
    project,
    actor,
    expectedRevision: request.expectedRevision,
    shotId: attempt.shotId
  }, deps)
  if (request.expectedShotRevision.revisionId !== current.pin.storyboardRevisionId
    || request.expectedShotRevision.shotHash !== current.pin.shotHash
    || !isShotProductionPinCurrent(attemptPin(attempt), current.pin)) {
    throw conflict('Artifact approval is stale for the current shot, copy or references')
  }

  const approvalValues = [
    attempt.id,
    artifactHash,
    current.pin.storyboardRevisionId,
    current.pin.referenceSetId,
    current.pin.planHash,
    current.pin.copyHash,
    current.pin.sourceHash,
    current.pin.referenceContentHash,
    current.pin.shotHash
  ]
  const inserted = await db.query(
    `INSERT INTO video_storyboard_shot_approvals (
       id, attempt_id, artifact_role, artifact_sha256, storyboard_revision_id, reference_set_id,
       plan_hash, copy_hash, source_hash, reference_content_hash, shot_hash, actor_id
     ) VALUES ($1,$2,'final_video',$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (attempt_id, artifact_role) DO NOTHING RETURNING id`,
    [(deps.randomUUID ?? randomUUID)(), ...approvalValues, actor.id]
  )
  if (!inserted.rows[0]) {
    const existing = (await db.query(
      `SELECT artifact_sha256, storyboard_revision_id, reference_set_id, plan_hash,
              copy_hash, source_hash, reference_content_hash, shot_hash
         FROM video_storyboard_shot_approvals
        WHERE attempt_id = $1 AND artifact_role = 'final_video'`,
      [attempt.id]
    )).rows[0]
    if (!existing || existing.artifact_sha256 !== artifactHash
      || existing.storyboard_revision_id !== current.pin.storyboardRevisionId
      || existing.reference_set_id !== current.pin.referenceSetId
      || existing.plan_hash !== current.pin.planHash
      || existing.copy_hash !== current.pin.copyHash
      || existing.source_hash !== current.pin.sourceHash
      || existing.reference_content_hash !== current.pin.referenceContentHash
      || existing.shot_hash !== current.pin.shotHash) {
      throw conflict('A different immutable artifact approval already exists')
    }
  }

  const updated = await db.query(
    `UPDATE video_storyboard_shot_attempts
        SET review_state = 'approved', reviewed_at = now(), updated_at = now()
      WHERE id = $1 AND execution_state = 'ready' AND review_state <> 'approved'
      RETURNING id`,
    [attempt.id]
  )
  if (!updated.rows[0] && !inserted.rows[0]) return mapShotProductionAttemptRow(await loadAttemptRowIn(db, project.id, attempt.id))
  if (!updated.rows[0]) throw conflict('Production attempt is no longer reviewable')
  return mapShotProductionAttemptRow(await loadAttemptRowIn(db, project.id, attempt.id))
}

export function approveShotArtifact(
  input: ApproveShotArtifactInput,
  deps: ShotProductionDependencies = {}
): Promise<ShotProductionAttempt> {
  return transaction(db => approveShotArtifactIn(db, input, deps))
}

export async function cancelShotAttemptIn(
  db: GodModeTransactionDb,
  input: CancelShotAttemptInput
): Promise<ShotProductionAttempt> {
  const parsed = CancelShotProductionRequestSchema.safeParse({
    projectId: input.projectId,
    attemptId: input.attemptId
  })
  if (!parsed.success) throw invalid('Invalid production cancellation request')
  const request = parsed.data
  const actor = await requireFreshProductionActorIn(db, input.actor)
  const unlocked = await requireStoryboardProjectIn(db, request.projectId, actor)
  const tenantId = unlocked.clientId ?? 'agency'
  await lockStoryboardProductionBudgetIn(db, tenantId)
  const project = await requireStoryboardProjectIn(db, request.projectId, actor, true)
  if (project.clientId !== unlocked.clientId) {
    throw conflict('Project client changed; reload before production')
  }
  await fenceWriteAuthorityIn(db, actor)
  await requireActiveProductionTenantIn(db, project.clientId)
  const row = await loadAttemptRowIn(db, project.id, request.attemptId, true)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Production attempt not found' })
  const attempt = mapShotProductionAttemptRow(row)
  if (attempt.requestSnapshot.tenantId !== tenantId) throw conflict('Production attempt belongs to the previous project client')
  if (attempt.jobStatus === 'succeeded') throw conflict('Succeeded production cannot be cancelled')
  if (attempt.executionState === 'cancelled') return attempt
  if (attempt.executionState === 'ready' || attempt.executionState === 'failed' || attempt.reviewState === 'approved') {
    throw conflict('Completed or approved production cannot be cancelled')
  }

  const released = await db.query(
    `UPDATE video_generation_jobs
        SET status = 'failed', error_message = 'Cancelled before submission',
            liability_state = 'released', liability_cents = 0,
            dispatch_eligible = FALSE, updated_at = now()
      WHERE id = $1 AND status = 'queued' AND liability_state = 'reserved'
        AND submission_attempted_at IS NULL AND provider_request_id IS NULL AND dispatch_eligible = FALSE
      RETURNING id`,
    [attempt.jobId]
  )
  if (released.rows[0]) {
    await db.query(
      `UPDATE video_storyboard_shot_attempts
          SET execution_state = 'cancelled', cancelled_at = now(), updated_at = now()
        WHERE id = $1`,
      [attempt.id]
    )
  } else if (attempt.submissionAttemptedAt) {
    await db.query(
      `UPDATE video_generation_jobs
          SET liability_state = CASE WHEN liability_state = 'reserved' THEN 'uncertain' ELSE liability_state END,
              dispatch_eligible = FALSE, updated_at = now()
        WHERE id = $1`,
      [attempt.jobId]
    )
    await db.query(
      `UPDATE video_storyboard_shot_attempts
          SET execution_state = 'cancelled', cancelled_at = now(), updated_at = now()
        WHERE id = $1`,
      [attempt.id]
    )
  } else {
    throw conflict('Only an unsubmitted, dispatch-held attempt can release its reservation')
  }
  return mapShotProductionAttemptRow(await loadAttemptRowIn(db, project.id, attempt.id))
}

export function cancelShotAttempt(input: CancelShotAttemptInput): Promise<ShotProductionAttempt> {
  return transaction(db => cancelShotAttemptIn(db, input))
}

/** Called by storyboard writers while holding the project lock; liabilities are untouched. */
export async function invalidateShotProductionAttemptsIn(
  db: GodModeTransactionDb,
  input: { projectId: string, shotId: string, current: ShotProductionRevisionPin }
): Promise<string[]> {
  const result = await db.query(
    `UPDATE video_storyboard_shot_attempts
        SET review_state = 'stale', updated_at = now()
      WHERE project_id = $1 AND shot_id = $2 AND review_state <> 'stale'
        AND (storyboard_revision_id <> $3 OR reference_set_id <> $4 OR plan_hash <> $5
          OR copy_hash <> $6 OR source_hash <> $7 OR reference_content_hash <> $8 OR shot_hash <> $9)
      RETURNING id`,
    [
      input.projectId,
      input.shotId,
      input.current.storyboardRevisionId,
      input.current.referenceSetId,
      input.current.planHash,
      input.current.copyHash,
      input.current.sourceHash,
      input.current.referenceContentHash,
      input.current.shotHash
    ]
  )
  return result.rows.map(row => row.id)
}
