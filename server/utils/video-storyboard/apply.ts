import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { z } from 'zod'
import { transaction } from '~~/server/utils/db'
import type { GodModeTransactionDb as Db } from '~~/server/utils/godMode/transactionCoordinator'
import { getCurrentTimelineIfMatchingIn, replaceTimelineWithCheckpointIn, type MediaProjectActor } from '~~/server/utils/audio/projects'
import { TimelineStateSchema, type TimelineState } from '~~/server/utils/audio/timelineSchema'
import { compileStoryboard } from '~~/shared/video/storyboardCompile'
import { requireStoryboardProjectIn } from './access'
import { getStoryboardIn } from './store'
import { resolveStoryboardIn } from './resolve'
import { probeStoryboardMedia, type MeasuredMedia } from './mediaProbe'
import type { ReferenceDependencies } from './references'
import { storyboardHash } from './hash'
import { isReadOnlyRole } from '~~/server/utils/permissions'
import { canvasFontLayers, validateCanvasFontAssets, validateBrandKitFontAssets } from '~~/server/utils/banner/fontAssets'

export const StoryboardApplyRequestSchema = z.object({
  operationId: z.string().uuid(), revisionId: z.string().uuid(), expectedTimelineId: z.string().uuid(),
  expectedEditRevision: z.number().int().nonnegative(), replaceConfirmed: z.boolean()
}).strict()
export type ApplyStoryboardInput = z.infer<typeof StoryboardApplyRequestSchema> & { projectId: string, actor: MediaProjectActor }
export interface StoryboardApplicationReceipt {
  id: string
  projectId: string
  operationId: string
  storyboardRevisionId: string
  sourceRevision: string
  before: { timelineId: string, editRevision: number }
  after: { timelineId: string, editRevision: number }
  checkpointTimelineId: string
  checkpointVersion: number
  afterState: TimelineState
  shotToClips: Record<string, string[]>
  obligationHash: string
  createdBy: string
  createdAt: string
}
export interface PreparedStoryboardApplication { revisionId: string, measurements: Map<string, MeasuredMedia>, resolvedHash?: string }
const conflict = () => createError({ statusCode: 409, statusMessage: 'Storyboard or timeline changed; review and retry with a new operation' })
function fingerprint(input: ApplyStoryboardInput) {
  const { actor, ...body } = input
  return storyboardHash({ ...body, actorId: actor.id })
}
function validateInput(input: ApplyStoryboardInput) {
  const { actor, projectId, ...body } = input
  if (!actor?.id || !z.string().uuid().safeParse(projectId).success || !StoryboardApplyRequestSchema.safeParse(body).success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid storyboard application request' })
  }
}
async function replayIn(db: Db, input: ApplyStoryboardInput) {
  const row = (await db.query('SELECT request_hash, receipt FROM video_storyboard_applications WHERE project_id = $1 AND operation_id = $2', [input.projectId, input.operationId])).rows[0]
  if (!row) return null
  if (row.request_hash !== fingerprint(input)) throw conflict()
  return row.receipt as StoryboardApplicationReceipt
}
export async function getStoryboardApplicationIn(db: Db, input: { actor: MediaProjectActor, projectId: string, operationId: string }): Promise<StoryboardApplicationReceipt | null> {
  await requireStoryboardProjectIn(db, input.projectId, input.actor)
  const row = (await db.query('SELECT receipt FROM video_storyboard_applications WHERE project_id = $1 AND operation_id = $2', [input.projectId, input.operationId])).rows[0]
  return row?.receipt ?? null
}
export function getStoryboardApplication(input: { actor: MediaProjectActor, projectId: string, operationId: string }) {
  return transaction(db => getStoryboardApplicationIn(db, input))
}

/** Expensive measurement happens before entering the committing transaction.
 * Cache keys include the private object's ETag and size; never reuse a measurement
 * for a changed fingerprint. This object is server-local, never HTTP input. */
export async function prepareStoryboardApplication(input: ApplyStoryboardInput, deps: ReferenceDependencies = {}): Promise<PreparedStoryboardApplication> {
  validateInput(input)
  const measurements = new Map<string, MeasuredMedia>()
  let resolvedHash: string | undefined
  await transaction(async (db) => {
    await requireStoryboardProjectIn(db, input.projectId, input.actor)
    if (await replayIn(db, input)) return
    const saved = await getStoryboardIn(db, input.projectId, input.actor, input.revisionId)
    if (!saved.revision) throw conflict()
    const resolved = await resolveStoryboardIn(db, { actor: input.actor, projectId: input.projectId, revisionId: input.revisionId, formats: [saved.revision.plan.targetFormat] }, deps, async (probe, context) => {
      const result = await probeStoryboardMedia(probe, context)
      measurements.set(storyboardHash(probe), result)
      return result
    })
    resolvedHash = storyboardHash(resolved)
    const compiled = compileStoryboard(resolved)
    if (!compiled.ok) throw createError({ statusCode: 409, statusMessage: 'Storyboard is not ready to apply', data: { findings: compiled.findings } })
  })
  return { revisionId: input.revisionId, measurements, resolvedHash }
}

/** Refresh write authority after preparation and fence revocation through commit. */
async function fenceWriteAuthorityIn(db: Db, actor: MediaProjectActor) {
  const denied = () => createError({ statusCode: 403, statusMessage: 'Current storyboard write access is unavailable' })
  const identity = (await db.query('SELECT user_role, custom_role_id FROM team_members WHERE id = $1 AND is_active = TRUE FOR SHARE', [actor.id])).rows[0]
  if (!identity || identity.user_role !== actor.role || isReadOnlyRole(identity.user_role)) throw denied()
  const roles = (await db.query('SELECT id, is_read_only FROM custom_roles WHERE id = $1 OR ($1::uuid IS NULL AND slug = $2 AND is_system = TRUE) ORDER BY id FOR SHARE', [identity.custom_role_id, identity.user_role])).rows
  // No unseeded fallback: insertion of a system policy could replace static
  // grants without touching an existing row. Refresh policy before applying.
  if (roles.length !== 1 || roles[0].is_read_only !== false) throw denied()
  await db.query('SELECT role_id FROM role_permission_groups WHERE role_id = ANY($1::uuid[]) ORDER BY role_id, permission_group FOR SHARE', [roles.map(role => role.id)])
}

/** Row locks conflict with ordinary UPDATE/DELETE writers, without requiring
 * those writers to adopt a new advisory-lock convention. Current authority rows
 * are locked; new additive grants cannot revoke an already-authorized decision.
 * Lock acquisition is bounded by lock_timeout; each SQL statement has its own
 * timeout. These are not a whole-transaction wall-time bound. */
async function fenceDependenciesIn(db: Db, saved: Awaited<ReturnType<typeof getStoryboardIn>>, actor: MediaProjectActor) {
  const references = saved.referenceSet
  if (!references) throw conflict()
  const tables: Record<string, string> = { video_asset: 'video_assets', audio_asset: 'audio_assets', source_asset: 'video_gen_source_assets', banner_project: 'banner_projects', brand_kit: 'brand_kits' }
  const sources = [...references.references.map(ref => ({ kind: ref.sourceKind as string, id: ref.assetId })), ...(references.brandKit ? [{ kind: 'brand_kit', id: references.brandKit.id }] : [])]
  const ordered = [...new Map(sources.map(source => [`${source.kind}:${source.id}`, source])).values()].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`))
  if (ordered.some(s => s.kind === 'banner_project' || s.kind === 'brand_kit')) {
    await db.query('SELECT client_id FROM client_team_assignments WHERE team_member_id = $1 ORDER BY client_id FOR SHARE', [actor.id])
  }
  for (const source of ordered) {
    const table = tables[source.kind]
    if (!table) throw conflict()
    const row = (await db.query(`SELECT * FROM ${table} WHERE id = $1 FOR SHARE`, [source.id])).rows[0]
    if (!row) throw conflict()
    if (source.kind === 'banner_project' || source.kind === 'brand_kit') {
      if (row.client_id) await db.query('SELECT id FROM agency_clients WHERE id = $1 FOR SHARE', [row.client_id])
      if (source.kind === 'banner_project') {
        // Legacy family lookup chooses the newest uploaded font. A concurrent
        // INSERT can change that winner, so only this legacy path needs a table
        // fence. Explicit managed font IDs use ordinary targeted row locks.
        const legacy = canvasFontLayers(row.canvas_data).some(layer => !layer.fontAssetId && layer.fontFamily)
        if (legacy) await db.query('LOCK TABLE banner_assets IN SHARE MODE')
        await validateCanvasFontAssets(row.canvas_data, row.client_id, db)
      } else await validateBrandKitFontAssets(row.fonts ?? [], row.client_id, db)
    }
    if (source.kind === 'video_asset' && row.source_project_id) {
      await db.query('SELECT id FROM media_projects WHERE id = $1 FOR SHARE', [row.source_project_id])
    }
  }
}

/** Caller owns the one committing transaction (including owner ledger writes).
 * Replay precedes all mutable preconditions: later edits cannot change a receipt. */
export async function applyStoryboardIn(db: Db, input: ApplyStoryboardInput, prepared: PreparedStoryboardApplication, deps: ReferenceDependencies = {}): Promise<StoryboardApplicationReceipt> {
  validateInput(input)
  await db.query('SET LOCAL lock_timeout = \'15s\'')
  await db.query('SET LOCAL statement_timeout = \'20s\'')
  await requireStoryboardProjectIn(db, input.projectId, input.actor, true)
  const replay = await replayIn(db, input)
  if (replay) return replay
  const committingDeps = { ...deps, metadataBudget: { remainingMs: 10_000 } }
  await fenceWriteAuthorityIn(db, input.actor)
  if (prepared.revisionId !== input.revisionId) throw conflict()
  const saved = await getStoryboardIn(db, input.projectId, input.actor, input.revisionId)
  if (!saved.revision || saved.storyboard?.currentRevisionId !== input.revisionId || saved.storyboard.currentReferenceSetId !== saved.revision.referenceSetId) throw conflict()
  const current = await getCurrentTimelineIfMatchingIn(db, input)
  if (!input.replaceConfirmed && TimelineStateSchema.parse(current.state).tracks.some(track => track.clips.length > 0)) {
    throw createError({ statusCode: 409, statusMessage: 'Confirm replacement of the non-empty timeline first' })
  }
  await fenceDependenciesIn(db, saved, input.actor)
  // Reauthorize all references and recheck copy/brand/source identities while SQL
  // mutation fences are held. Only exact already-measured fingerprints may pass.
  const resolved = await resolveStoryboardIn(db, { actor: input.actor, projectId: input.projectId, revisionId: input.revisionId, formats: [saved.revision.plan.targetFormat] }, committingDeps, async (probe) => {
    const measurement = prepared.measurements.get(storyboardHash(probe))
    if (!measurement) throw conflict()
    return measurement
  })
  if (prepared.resolvedHash !== storyboardHash(resolved)) throw conflict()
  const compiled = compileStoryboard(resolved)
  if (!compiled.ok) throw createError({ statusCode: 409, statusMessage: 'Storyboard is not ready to apply', data: { findings: compiled.findings } })
  const { checkpoint, timeline } = await replaceTimelineWithCheckpointIn(db, { ...input, state: compiled.timeline })
  const afterState = TimelineStateSchema.parse(timeline.state)
  const shotToClips: Record<string, string[]> = {}
  for (const track of afterState.tracks) for (const clip of track.clips) {
    if (clip.storyboard) (shotToClips[clip.storyboard.shotId] ??= []).push(clip.id)
  }
  const receipt: StoryboardApplicationReceipt = {
    id: randomUUID(), projectId: input.projectId, operationId: input.operationId, storyboardRevisionId: input.revisionId,
    sourceRevision: saved.revision.sourceHash, before: { timelineId: current.id, editRevision: current.editRevision },
    after: { timelineId: timeline.id, editRevision: timeline.editRevision }, checkpointTimelineId: checkpoint.id, checkpointVersion: checkpoint.version,
    afterState, shotToClips, obligationHash: storyboardHash(compiled.obligations), createdBy: input.actor.id, createdAt: new Date().toISOString()
  }
  await db.query(`INSERT INTO video_storyboard_applications (id, project_id, storyboard_revision_id, operation_id, request_hash, timeline_id, timeline_edit_revision, checkpoint_timeline_id, receipt, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [receipt.id, input.projectId, input.revisionId, input.operationId, fingerprint(input), timeline.id, timeline.editRevision, checkpoint.id, JSON.stringify(receipt), input.actor.id])
  await db.query(`INSERT INTO video_storyboard_timeline_obligations (project_id, timeline_id, edit_revision, application_id, contract, contract_hash, review_state, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [input.projectId, timeline.id, timeline.editRevision, receipt.id, JSON.stringify(compiled.obligations), receipt.obligationHash, JSON.stringify({ status: 'unreviewed' }), input.actor.id])
  return receipt
}
export async function applyStoryboard(input: ApplyStoryboardInput, deps: ReferenceDependencies = {}) {
  const prepared = await prepareStoryboardApplication(input, deps)
  return transaction(db => applyStoryboardIn(db, input, prepared, deps))
}
