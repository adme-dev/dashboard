import { invalidateStoryboardProductionReviewsIn } from './productionInvalidation'
import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { z } from 'zod'
import { transaction } from '~~/server/utils/db'
import type { GodModeTransactionDb as Db } from '~~/server/utils/godMode/transactionCoordinator'
import type { MediaProjectActor } from '~~/server/utils/audio/projects'
import { StoryboardPlanSchema, type AssetBinding, type StoryboardPlan } from '~~/shared/video/storyboard'
import { validateStoryboardPlan } from '~~/shared/video/storyboardValidation'
import { ReferenceSetWriteSchema, type ReferenceSetWrite, type StoryboardReferenceSet, type ResolvedReferenceSet } from '~~/shared/video/storyboardReferences'
import { requireStoryboardProjectIn } from './access'
import { canonicalReferenceIn, checkReferencesIn, pinReferencesIn, type ReferenceDependencies } from './references'
import { storyboardHash } from './hash'

const WriteIdentity = z.object({ projectId: z.string().uuid(), expectedRevision: z.string().uuid().nullable(), operationId: z.string().uuid() })
const conflict = () => createError({ statusCode: 409, statusMessage: 'Storyboard changed or operation ID was reused; reload before retrying' })
const invalid = () => createError({ statusCode: 400, statusMessage: 'Invalid storyboard revision' })
interface StoryboardRow { id: string, project_id: string, current_revision_id: string | null, current_reference_set_id: string | null }
export interface StoryboardRevision {
  id: string
  projectId: string
  sequence: number
  parentId: string | null
  referenceSetId: string
  plan: StoryboardPlan
  planHash: string
  copyHash: string
  sourceHash: string
  createdBy: string
  createdAt: string
}
interface ReferenceRow {
  id: string
  project_id: string
  sequence: number
  parent_id: string | null
  reference_data: Pick<StoryboardReferenceSet, 'references' | 'brandKit'>
  content_hash: string
  created_by: string
  created_at: string
}
interface RevisionRow {
  id: string
  project_id: string
  sequence: number
  parent_id: string | null
  reference_set_id: string
  plan: StoryboardPlan
  plan_hash: string
  copy_hash: string
  source_hash: string
  created_by: string
  created_at: string
}
function mapReference(row: ReferenceRow): StoryboardReferenceSet {
  return { id: row.id, projectId: row.project_id, sequence: row.sequence, parentId: row.parent_id,
    ...row.reference_data, contentHash: row.content_hash, createdBy: row.created_by, createdAt: row.created_at }
}
function mapRevision(row: RevisionRow): StoryboardRevision {
  return { id: row.id, projectId: row.project_id, sequence: row.sequence, parentId: row.parent_id,
    referenceSetId: row.reference_set_id, plan: row.plan, planHash: row.plan_hash, copyHash: row.copy_hash,
    sourceHash: row.source_hash, createdBy: row.created_by, createdAt: row.created_at }
}
async function rootIn(db: Db, projectId: string): Promise<StoryboardRow | null> {
  return (await db.query('SELECT * FROM video_storyboards WHERE project_id = $1', [projectId])).rows[0] ?? null
}

/** No create-on-read. Historical lookups authorize the same project first. */
export async function getStoryboardIn(db: Db, projectId: string, actor: MediaProjectActor, revisionId?: string) {
  await requireStoryboardProjectIn(db, projectId, actor)
  const root = await rootIn(db, projectId)
  if (!root) {
    if (revisionId) throw createError({ statusCode: 404, statusMessage: 'Storyboard revision not found' })
    return { storyboard: null, revision: null, referenceSet: null }
  }
  const requested = revisionId ?? root.current_revision_id
  const row: RevisionRow | undefined = requested
    ? (await db.query('SELECT * FROM video_storyboard_revisions WHERE project_id = $1 AND id = $2', [projectId, requested])).rows[0]
    : undefined
  if (requested && !row) throw createError({ statusCode: 404, statusMessage: 'Storyboard revision not found' })
  const refId = revisionId ? row?.reference_set_id : root.current_reference_set_id
  const reference: ReferenceRow | undefined = refId
    ? (await db.query('SELECT * FROM video_storyboard_reference_sets WHERE project_id = $1 AND id = $2', [projectId, refId])).rows[0]
    : undefined
  return {
    storyboard: { id: root.id, projectId, currentRevisionId: root.current_revision_id, currentReferenceSetId: root.current_reference_set_id },
    revision: row ? mapRevision(row) : null,
    referenceSet: reference ? mapReference(reference) : null
  }
}
export function getStoryboard(projectId: string, actor: MediaProjectActor, revisionId?: string) {
  return transaction(db => getStoryboardIn(db, projectId, actor, revisionId))
}

export async function saveReferenceSetIn(db: Db, input: ReferenceSetWrite & { projectId: string, actor: MediaProjectActor }, deps: ReferenceDependencies = {}): Promise<StoryboardReferenceSet> {
  const identity = WriteIdentity.safeParse(input)
  const parsed = ReferenceSetWriteSchema.safeParse({ expectedRevision: input.expectedRevision, operationId: input.operationId, references: input.references, brandKit: input.brandKit })
  if (!identity.success || !parsed.success) throw invalid()
  const project = await requireStoryboardProjectIn(db, input.projectId, input.actor, true)
  let root = await rootIn(db, input.projectId)
  const requestHash = storyboardHash({ ...parsed.data, actorId: input.actor.id, projectId: input.projectId })
  const replay = (await db.query('SELECT * FROM video_storyboard_reference_sets WHERE project_id = $1 AND operation_id = $2', [input.projectId, input.operationId])).rows[0]
  if (replay) {
    if (replay.request_hash !== requestHash) throw conflict()
    return mapReference(replay)
  }
  if ((root?.current_reference_set_id ?? null) !== input.expectedRevision) throw conflict()
  // Resolve before inserting anything; rejected references cannot create empty roots.
  const pins = await pinReferencesIn(db, project, input.actor, parsed.data.references, parsed.data.brandKit, deps)
  if (!root) {
    root = (await db.query('INSERT INTO video_storyboards (project_id, created_by) VALUES ($1, $2) RETURNING *', [input.projectId, input.actor.id])).rows[0]
  }
  const row = (await db.query(
    `INSERT INTO video_storyboard_reference_sets (id, project_id, sequence, parent_id, reference_data, content_hash, operation_id, request_hash, created_by)
     VALUES ($1,$2,COALESCE((SELECT MAX(sequence) FROM video_storyboard_reference_sets WHERE project_id=$2),0)+1,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [randomUUID(), input.projectId, root!.current_reference_set_id, JSON.stringify(pins), storyboardHash(pins), input.operationId, requestHash, input.actor.id]
  )).rows[0]
  await db.query('UPDATE video_storyboards SET current_reference_set_id = $1, updated_at = now() WHERE project_id = $2', [row.id, input.projectId])
  await invalidateStoryboardProductionReviewsIn(db, input.projectId)
  return mapReference(row)
}
export function saveReferenceSet(input: ReferenceSetWrite & { projectId: string, actor: MediaProjectActor }, deps: ReferenceDependencies = {}) {
  return transaction(db => saveReferenceSetIn(db, input, deps))
}

export interface SaveStoryboardRevisionInput {
  projectId: string
  actor: MediaProjectActor
  expectedRevision: string | null
  operationId: string
  plan: unknown
  approveCopy?: boolean
  expectedCopyHash?: string
}
export async function saveStoryboardRevisionIn(db: Db, input: SaveStoryboardRevisionInput, deps: ReferenceDependencies = {}): Promise<StoryboardRevision> {
  if (!WriteIdentity.safeParse(input).success) throw invalid()
  if (Buffer.byteLength(JSON.stringify(input.plan) ?? '') > 512_000) throw createError({ statusCode: 413, statusMessage: 'Storyboard is too large' })
  const project = await requireStoryboardProjectIn(db, input.projectId, input.actor, true)
  const root = await rootIn(db, input.projectId)
  const requestHash = storyboardHash({ projectId: input.projectId, actorId: input.actor.id, expectedRevision: input.expectedRevision, operationId: input.operationId, plan: input.plan, approveCopy: input.approveCopy === true, expectedCopyHash: input.expectedCopyHash ?? null })
  const replay = (await db.query('SELECT * FROM video_storyboard_revisions WHERE project_id = $1 AND operation_id = $2', [input.projectId, input.operationId])).rows[0]
  if (replay) {
    if (replay.request_hash !== requestHash) throw conflict()
    return mapRevision(replay)
  }
  if (!root || root.current_revision_id !== input.expectedRevision) throw conflict()
  const parsed = StoryboardPlanSchema.safeParse(input.plan)
  if (!parsed.success) throw invalid()
  const plan = parsed.data
  if (plan.projectId !== project.id || plan.id !== root.id || plan.referenceSetRevisionId !== root.current_reference_set_id) throw conflict()
  const reference: ReferenceRow | undefined = (await db.query('SELECT * FROM video_storyboard_reference_sets WHERE project_id = $1 AND id = $2', [project.id, plan.referenceSetRevisionId])).rows[0]
  if (!reference) throw conflict()
  const copyHash = storyboardHash({ scriptSegments: plan.copy.scriptSegments, cues: plan.copy.cues })
  if (copyHash !== plan.copy.contentHash) throw invalid()
  const knownCopy = (await db.query(`SELECT plan->'copy' AS copy FROM video_storyboard_revisions WHERE project_id = $1 AND plan->>'copyRevisionId' = $2 ORDER BY sequence DESC LIMIT 1`, [project.id, plan.copyRevisionId])).rows[0]?.copy
  if (knownCopy && (knownCopy.contentHash !== copyHash || knownCopy.revision !== plan.copy.revision)) throw conflict()
  // A candidate may retain canonical approval, never supply new approval fields.
  if (plan.copy.approval && (!knownCopy?.approval || storyboardHash(knownCopy.approval) !== storyboardHash(plan.copy.approval))) throw invalid()
  if (input.approveCopy === true) {
    if (input.expectedCopyHash !== copyHash) throw conflict()
    plan.copy.approval = { actorId: input.actor.id, approvedAt: new Date().toISOString(), contentHash: copyHash }
  }
  if (!validateStoryboardPlan(plan).ok) throw invalid()

  const bindings = new Map<string, Extract<AssetBinding, { status: 'bound' }>>()
  for (const shot of plan.shots) {
    const assets = [shot.visual, ...shot.audioCues.map(cue => cue.asset), ...shot.overlayCues.map(cue => cue.asset)]
    for (const asset of assets) {
      if (asset.status !== 'bound') continue
      const key = `${asset.sourceKind}:${asset.assetId}`
      const existing = bindings.get(key)
      if (existing && existing.contentHash !== asset.contentHash) throw conflict()
      bindings.set(key, asset)
    }
  }
  if (bindings.size > 64) throw invalid()
  for (const binding of bindings.values()) {
    const canonical = await canonicalReferenceIn(db, project, input.actor, binding.sourceKind, binding.assetId, deps)
    if (canonical.contentHash !== binding.contentHash) throw conflict()
  }
  const row = (await db.query(
    `INSERT INTO video_storyboard_revisions (id, project_id, sequence, parent_id, reference_set_id, plan, plan_hash, copy_hash, source_hash, operation_id, request_hash, created_by)
     VALUES ($1,$2,COALESCE((SELECT MAX(sequence) FROM video_storyboard_revisions WHERE project_id=$2),0)+1,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING RETURNING *`,
    [plan.revision, project.id, root.current_revision_id, reference.id, JSON.stringify(plan), storyboardHash(plan), copyHash,
      storyboardHash({ referenceHash: reference.content_hash, bindings: [...bindings.values()] }), input.operationId, requestHash, input.actor.id]
  )).rows[0]
  if (!row) throw conflict()
  await db.query('UPDATE video_storyboards SET current_revision_id = $1, updated_at = now() WHERE project_id = $2', [row.id, project.id])
  await invalidateStoryboardProductionReviewsIn(db, project.id)
  return mapRevision(row)
}
export function saveStoryboardRevision(input: SaveStoryboardRevisionInput, deps: ReferenceDependencies = {}) {
  return transaction(db => saveStoryboardRevisionIn(db, input, deps))
}

/** Current eligibility is separate from the immutable historical approval record. */
export async function resolveReferenceSetIn(db: Db, input: { projectId: string, revisionId?: string, actor: MediaProjectActor }, deps: ReferenceDependencies = {}): Promise<ResolvedReferenceSet | null> {
  const saved = await getStoryboardIn(db, input.projectId, input.actor, input.revisionId)
  if (saved.revision && saved.referenceSet?.id !== saved.revision.referenceSetId) {
    const pinned = (await db.query('SELECT * FROM video_storyboard_reference_sets WHERE project_id = $1 AND id = $2', [input.projectId, saved.revision.referenceSetId])).rows[0]
    if (!pinned) throw conflict()
    saved.referenceSet = mapReference(pinned)
  }
  if (!saved.referenceSet) return null
  const project = await requireStoryboardProjectIn(db, input.projectId, input.actor)
  const findings = await checkReferencesIn(db, project, input.actor, saved.referenceSet, deps)
  if (saved.storyboard?.currentReferenceSetId !== saved.referenceSet.id) {
    findings.push({ code: 'reference_set_superseded', severity: 'blocker', message: 'Reference decisions changed after this revision; review the current reference set.' })
  }
  return { referenceSet: saved.referenceSet, findings, eligible: findings.length === 0 }
}
export function resolveReferenceSet(input: { projectId: string, revisionId?: string, actor: MediaProjectActor }, deps: ReferenceDependencies = {}) {
  return transaction(db => resolveReferenceSetIn(db, input, deps))
}
