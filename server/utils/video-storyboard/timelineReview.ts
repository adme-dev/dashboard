import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { z } from 'zod'
import { transaction } from '~~/server/utils/db'
import type { GodModeTransactionDb as Db } from '~~/server/utils/godMode/transactionCoordinator'
import { getCurrentTimelineIfMatchingIn, type MediaProjectActor } from '~~/server/utils/audio/projects'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import { storyboardApprovalChanges, type StoryboardFormat } from '~~/shared/video/storyboardCompile'
import { requireStoryboardProjectIn } from './access'
import { loadTimelineObligationsIn } from './lineage'
import { getStoryboardIn } from './store'
import { remapObligations, prepareStoryboardRenderIn } from './renderValidation'
import { storyboardHash } from './hash'
import { canonicalReferenceIn, type ReferenceDependencies } from './references'
import { fenceWriteAuthorityIn, fenceDependenciesIn } from './apply'
import { CopyRecoveryApprovalSchema, ReferenceRecoveryApprovalSchema, loadApprovedCopyIn, approveRecoveryCopyIn, neededTimelineReferencesIn, approveRecoveryReferencesIn, resolveTimelineReferenceSetIn } from './reviewRecovery'

export const TimelineReviewRequestSchema = z.object({ operationId: z.string().uuid(), expectedTimelineId: z.string().uuid(), expectedEditRevision: z.number().int().nonnegative(), obligationMappings: z.array(z.object({ clipId: z.string().min(1), replacementClipId: z.string().min(1) }).strict()).max(256), copyRevisionId: z.string().uuid().optional(), copyApproval: CopyRecoveryApprovalSchema.optional(), referenceApproval: z.array(ReferenceRecoveryApprovalSchema).max(24).optional() }).strict().refine(value => !(value.copyApproval && value.copyRevisionId), { message: 'Choose existing copy or explicitly approve revised copy, not both' })
export type TimelineReviewInput = z.infer<typeof TimelineReviewRequestSchema> & { actor: MediaProjectActor, projectId: string }
const formats: StoryboardFormat[] = ['reels_9x16', 'square_1x1', 'youtube_16x9']
const conflict = () => createError({ statusCode: 409, statusMessage: 'Timeline or approval changed; refresh and review again' })
export async function getTimelineReviewIn(db: Db, input: { actor: MediaProjectActor, projectId: string }, deps: ReferenceDependencies = {}) {
  const project = await requireStoryboardProjectIn(db, input.projectId, input.actor)
  const row = (await db.query('SELECT t.* FROM media_timelines t JOIN media_projects p ON p.current_timeline_id = t.id WHERE p.id = $1', [input.projectId])).rows[0]
  if (!row) throw conflict()
  const prepared = await prepareStoryboardRenderIn(db, { ...input, timelineId: row.id, editRevision: row.edit_revision, formats }, deps)
  const current = prepared.lineage ? await getStoryboardIn(db, input.projectId, input.actor) : null
  const copy = prepared.lineage ? await loadApprovedCopyIn(db, input.projectId, prepared.lineage.contract.copyRevisionId) : null
  const scope = current?.referenceSet ? await resolveTimelineReferenceSetIn(db, current.referenceSet, prepared.lineage?.referenceSetId ?? null) : null
  const references = scope ? await neededTimelineReferencesIn(db, project, input.actor, prepared.state, scope.current ? scope.referenceSet : current!.referenceSet!, deps) : []
  return { copy, references, timelineId: row.id, editRevision: row.edit_revision, obligations: prepared.lineage?.contract ?? null,
    findings: prepared.findings, changes: prepared.lineage ? storyboardApprovalChanges(prepared.lineage.baseline, prepared.state, prepared.lineage.contract) : [],
    review: prepared.findings.length ? null : prepared.lineage?.review ?? null }
}
export function getTimelineReview(input: { actor: MediaProjectActor, projectId: string }, deps: ReferenceDependencies = {}) {
  return transaction(db => getTimelineReviewIn(db, input, deps))
}
export async function reviewAdjustedTimelineIn(db: Db, input: TimelineReviewInput, deps: ReferenceDependencies = {}) {
  await db.query('SET LOCAL lock_timeout = \'15s\'')
  await requireStoryboardProjectIn(db, input.projectId, input.actor, true)
  const requestHash = storyboardHash(input)
  const replay = (await db.query('SELECT * FROM video_storyboard_timeline_reviews WHERE project_id = $1 AND operation_id = $2', [input.projectId, input.operationId])).rows[0]
  if (replay) {
    if (replay.request_hash !== requestHash) throw conflict()
    return { timelineId: replay.timeline_id, editRevision: replay.edit_revision, review: { id: replay.id, createdAt: replay.created_at, operationId: replay.operation_id }, findings: [] }
  }
  await fenceWriteAuthorityIn(db, input.actor)
  const timeline = await getCurrentTimelineIfMatchingIn(db, input)
  const lineage = await loadTimelineObligationsIn(db, input.projectId, timeline.id, timeline.editRevision)
  if (!lineage) throw createError({ statusCode: 400, statusMessage: 'Timeline has no storyboard obligations to review' })
  const current = await getStoryboardIn(db, input.projectId, input.actor)
  if (!current.referenceSet) throw conflict()
  const rootReferenceSetId = current.referenceSet.id
  const scopedReferences = await resolveTimelineReferenceSetIn(db, current.referenceSet, lineage.referenceSetId)
  if (scopedReferences.current) current.referenceSet = scopedReferences.referenceSet
  const state = TimelineStateSchema.parse(timeline.state)
  const project = await requireStoryboardProjectIn(db, input.projectId, input.actor)
  if (input.referenceApproval?.length) {
    const needed = await neededTimelineReferencesIn(db, project, input.actor, state, current.referenceSet, deps)
    // Lock new selected sources too before any canonical approval mutation.
    const extra = needed.filter(n => input.referenceApproval!.some(a => a.assetId === n.assetId && a.sourceKind === n.sourceKind))
    await fenceDependenciesIn(db, { ...current, referenceSet: { ...current.referenceSet, references: [...current.referenceSet.references, ...extra.map(n => ({ ...n, role: 'product' as const, identityKind: 'record' as const, decision: 'unreviewed' as const, approval: null }))] } }, input.actor)
    current.referenceSet = await approveRecoveryReferencesIn(db, { project, actor: input.actor, operationId: input.operationId, rootReferenceSetId, current: current.referenceSet, needed, approvals: input.referenceApproval }, deps)
  }
  await fenceDependenciesIn(db, current, input.actor)
  const contract = remapObligations(lineage.contract, input.obligationMappings)
  let copyRevisionId = input.copyRevisionId
  if (input.copyApproval) {
    const prior = await loadApprovedCopyIn(db, input.projectId, contract.copyRevisionId)
    if (!prior) throw conflict()
    const copy = await approveRecoveryCopyIn(db, { projectId: input.projectId, timelineId: timeline.id, editRevision: timeline.editRevision, operationId: input.operationId, actor: input.actor, prior, approval: input.copyApproval })
    copyRevisionId = copy.id
  }
  if (copyRevisionId && copyRevisionId !== contract.copyRevisionId) {
    const copy = await loadApprovedCopyIn(db, input.projectId, copyRevisionId)
    if (!copy) throw createError({ statusCode: 409, statusMessage: 'New copy requires explicit human approval' })
    // Explicit revision acceptance may remove an old requirement. New required
    // IDs need a mapped existing obligation; never silently omit new copy.
    const items = [...copy.cues, ...copy.scriptSegments.map(s => ({ ...s, required: true }))]
    if (copy.cues.some(c => c.required && !contract.cues.some(o => o.copyId === c.id))) throw createError({ statusCode: 409, statusMessage: 'New required copy needs a mapped cue before review' })
    contract.cues = contract.cues.flatMap((cue) => {
      const replacement = items.find(c => c.id === cue.copyId)
      return replacement ? [{ ...cue, text: replacement.text, required: replacement.required }] : []
    })
    contract.copyRevisionId = copyRevisionId
    contract.copyHash = copy.contentHash
  }
  const omittedOptionalClips = new Set(contract.cues.filter(cue => !cue.required && !state.tracks.some(track => track.clips.some(clip => clip.id === cue.clipId))).map(cue => cue.clipId))
  contract.cues = contract.cues.filter(cue => !omittedOptionalClips.has(cue.clipId))
  contract.sources = contract.sources.filter(source => !(source.sourceKind === 'banner_project' && omittedOptionalClips.has(source.clipId)))
  // Replacement sources are selected solely from the current approved inventory,
  // by canonical clip asset ID + exact server-owned locator, never client hashes.
  const tables = { video_asset: 'video_assets', audio_asset: 'audio_assets', source_asset: 'video_gen_source_assets', banner_project: 'banner_projects' }
  for (const track of state.tracks) for (const clip of track.clips) {
    if (track.hidden || track.muted || clip.type === 'caption' || contract.sources.some(s => s.clipId === clip.id)) continue
    contract.sources.push({ clipId: clip.id, shotId: clip.storyboard?.shotId ?? clip.id, sourceKind: '', assetId: '', contentHash: '', startFrame: 0, durationFrames: 0, sourceInFrames: 0 })
  }
  for (const source of contract.sources) {
    const clip = state.tracks.flatMap(t => t.clips).find(c => c.id === source.clipId)
    if (!clip || (clip.type !== 'audio' && clip.type !== 'video' && clip.type !== 'overlay')) continue
    const candidates = [...new Map(current.referenceSet.references.filter(ref => ref.decision === 'approved' && (clip.type === 'overlay' ? ref.sourceKind === 'banner_project' && ref.assetId === clip.gsap_project_id : ref.sourceKind !== 'banner_project' && (clip.asset_id === ref.assetId || (clip.asset_id === null && ref.sourceKind === 'source_asset')))).map(ref => [`${ref.sourceKind}:${ref.assetId}`, ref] as const)).values()]
    const matching = []
    for (const ref of candidates) {
      const row = (await db.query(`SELECT * FROM ${tables[ref.sourceKind]} WHERE id = $1`, [ref.assetId])).rows[0]
      if (!row || (clip.type !== 'overlay' && (ref.sourceKind === 'audio_asset' ? row.r2_key_master : row.r2_key) !== clip.r2_key)) continue
      const identity = await canonicalReferenceIn(db, project, input.actor, ref.sourceKind, ref.assetId, deps)
      if (identity.contentHash === ref.contentHash && ref.approval?.contentHash === ref.contentHash) matching.push(ref)
    }
    if (matching.length !== 1) throw createError({ statusCode: 409, statusMessage: 'Replacement needs current source approval', data: { findings: [{ code: 'usage_approval_required', severity: 'blocker', message: 'Approve the replacement reference before reviewing this edit.' }] } })
    source.sourceKind = matching[0]!.sourceKind
    source.assetId = matching[0]!.assetId
    source.contentHash = matching[0]!.contentHash
    source.startFrame = Math.round(clip.timeline_start_sec * state.fps)
    source.durationFrames = Math.round((clip.type === 'audio' ? (clip.source_out_sec ?? 0) - clip.source_in_sec : clip.duration_sec) * state.fps)
    source.sourceInFrames = clip.type === 'overlay' ? 0 : Math.round(clip.source_in_sec * state.fps)
  }
  for (const cue of contract.cues) {
    const clip = state.tracks.flatMap(t => t.clips).find(c => c.id === cue.clipId)
    if (clip?.type === 'caption' || clip?.type === 'overlay') {
      cue.startFrame = Math.round(clip.timeline_start_sec * state.fps)
      cue.durationFrames = Math.round(clip.duration_sec * state.fps)
    }
  }
  const reviewed = { ...lineage, contract, baseline: state, referenceSetId: current.referenceSet.id }
  const prepared = await prepareStoryboardRenderIn(db, { actor: input.actor, projectId: input.projectId, timelineId: timeline.id, editRevision: timeline.editRevision, formats }, deps, reviewed)
  if (prepared.findings.some(f => f.severity === 'blocker')) throw createError({ statusCode: 409, statusMessage: 'Correct the adjusted edit before accepting review', data: { findings: prepared.findings } })
  const id = randomUUID()
  const row = (await db.query(`INSERT INTO video_storyboard_timeline_reviews (id,project_id,timeline_id,edit_revision,operation_id,request_hash,contract,baseline_state,reference_set_id,created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [id, input.projectId, timeline.id, timeline.editRevision, input.operationId, requestHash, JSON.stringify(contract), JSON.stringify(state), current.referenceSet.id, input.actor.id])).rows[0]
  return { timelineId: timeline.id, editRevision: timeline.editRevision, review: { id, createdAt: row.created_at, operationId: input.operationId }, findings: [] }
}
export function reviewAdjustedTimeline(input: TimelineReviewInput, deps: ReferenceDependencies = {}) {
  return transaction(db => reviewAdjustedTimelineIn(db, input, deps))
}
