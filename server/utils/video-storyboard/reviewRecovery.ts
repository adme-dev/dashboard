import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { z } from 'zod'
import type { GodModeTransactionDb as Db } from '~~/server/utils/godMode/transactionCoordinator'
import { CopyRevisionSchema, type CopyRevision } from '~~/shared/video/storyboard'
import { ReferenceSourceKindSchema, type ReferenceSourceKind, type StoryboardReferenceSet } from '~~/shared/video/storyboardReferences'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'
import type { MediaProjectActor } from '~~/server/utils/audio/projects'
import type { StoryboardProject } from './access'
import { canonicalReferenceIn, pinReferencesIn, type ReferenceDependencies } from './references'
import { storyboardHash } from './hash'

const copyText = z.object({ id: z.string().min(1).max(100), text: z.string().min(1).max(20000) }).strict()
export const CopyRecoveryApprovalSchema = z.object({ expectedCopyHash: z.string().regex(/^[a-f0-9]{64}$/), scriptSegments: z.array(copyText).max(100), cues: z.array(copyText.extend({ required: z.boolean() })).max(100) }).strict()
export const ReferenceRecoveryApprovalSchema = z.object({ sourceKind: ReferenceSourceKindSchema, assetId: z.string().uuid(), expectedContentHash: z.string().regex(/^[a-f0-9]{64}$/), evidence: z.string().trim().min(1).max(2000) }).strict()
export const BrandKitRecoveryApprovalSchema = z.object({ id: z.string().uuid(), expectedPinnedHash: z.string().regex(/^[a-f0-9]{64}$/), expectedContentHash: z.string().regex(/^[a-f0-9]{64}$/), evidence: z.string().trim().min(1).max(2000) }).strict()
export interface NeededBrandKit { id: string, pinnedContentHash: string, contentHash: string, decision: 'approved' | 'pending' }
/** Offer only the pinned kit after canonical actor/client authorization. */
export async function neededTimelineBrandKitIn(db: Db, project: StoryboardProject, actor: MediaProjectActor, refs: StoryboardReferenceSet, deps: ReferenceDependencies): Promise<NeededBrandKit | null> {
  if (!refs.brandKit) return null
  try {
    const identity = await canonicalReferenceIn(db, project, actor, 'brand_kit', refs.brandKit.id, deps)
    return { id: refs.brandKit.id, pinnedContentHash: refs.brandKit.contentHash, contentHash: identity.contentHash, decision: refs.brandKit.contentHash === identity.contentHash ? 'approved' : 'pending' }
  } catch { return null /* Unavailable kits remain render blockers, never candidates. */ }
}
export async function loadApprovedCopyIn(db: Db, projectId: string, copyRevisionId: string): Promise<CopyRevision | null> {
  const recovery = (await db.query('SELECT copy FROM video_storyboard_review_copies WHERE project_id = $1 AND id = $2', [projectId, copyRevisionId])).rows[0]
  const copy = recovery?.copy ?? (await db.query(`SELECT plan->'copy' AS copy FROM video_storyboard_revisions WHERE project_id = $1 AND plan->>'copyRevisionId' = $2 ORDER BY sequence DESC LIMIT 1`, [projectId, copyRevisionId])).rows[0]?.copy
  if (!copy) return null
  const parsed = CopyRevisionSchema.safeParse(copy)
  return parsed.success && parsed.data.approval?.contentHash === parsed.data.contentHash ? parsed.data : null
}
export async function approveRecoveryCopyIn(db: Db, input: { projectId: string, timelineId: string, editRevision: number, operationId: string, actor: MediaProjectActor, prior: CopyRevision, approval: z.infer<typeof CopyRecoveryApprovalSchema> }) {
  if (input.prior.contentHash !== input.approval.expectedCopyHash) throw createError({ statusCode: 409, statusMessage: 'Copy changed; refresh before approving' })
  const { scriptSegments, cues } = input.approval
  if (new Set([...scriptSegments, ...cues].map(s => s.id)).size !== scriptSegments.length + cues.length) throw createError({ statusCode: 400, statusMessage: 'Duplicate copy identifiers' })
  const contentHash = storyboardHash({ scriptSegments, cues })
  const copy = CopyRevisionSchema.parse({ ...input.prior, id: randomUUID(), revision: input.prior.revision + 1, scriptSegments, cues, contentHash, approval: { actorId: input.actor.id, approvedAt: new Date().toISOString(), contentHash } })
  await db.query('INSERT INTO video_storyboard_review_copies (id,project_id,timeline_id,edit_revision,source_copy_revision_id,operation_id,copy,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [copy.id, input.projectId, input.timelineId, input.editRevision, input.prior.id, input.operationId, JSON.stringify(copy), input.actor.id])
  return copy
}
export interface NeededReference { sourceKind: ReferenceSourceKind, assetId: string, contentHash: string, decision: 'approved' | 'pending', clipIds: string[] }
export async function neededTimelineReferencesIn(db: Db, project: StoryboardProject, actor: MediaProjectActor, state: TimelineState, refs: StoryboardReferenceSet, deps: ReferenceDependencies): Promise<NeededReference[]> {
  const result = new Map<string, NeededReference>()
  for (const track of state.tracks) for (const clip of track.clips) {
    if (track.hidden || track.muted || clip.type === 'caption') continue
    let sourceKind: ReferenceSourceKind = clip.type === 'overlay' ? 'banner_project' : clip.type === 'audio' ? 'audio_asset' : 'video_asset'
    let assetId = clip.type === 'overlay' ? clip.gsap_project_id : clip.asset_id
    if (!assetId && clip.type === 'video') {
      const rows = (await db.query('SELECT id FROM video_gen_source_assets WHERE r2_key = $1', [clip.r2_key])).rows
      if (rows.length !== 1) continue
      assetId = rows[0].id
      sourceKind = 'source_asset'
    }
    if (!assetId) continue
    const key = `${sourceKind}:${assetId}`
    const previous = result.get(key)
    if (previous) {
      previous.clipIds.push(clip.id)
      continue
    }
    try {
      const identity = await canonicalReferenceIn(db, project, actor, sourceKind, assetId, deps)
      const pin = refs.references.find(r => r.sourceKind === sourceKind && r.assetId === assetId)
      result.set(key, { sourceKind, assetId, contentHash: identity.contentHash, decision: pin?.decision === 'approved' && pin.contentHash === identity.contentHash && pin.approval?.contentHash === identity.contentHash ? 'approved' : 'pending', clipIds: [clip.id] })
    } catch { /* Unavailable sources cannot be offered for human reapproval. */ }
  }
  return [...result.values()]
}
/** Preserve untouched decisions verbatim. Only explicit, current, cut-scoped
 * selections may get a new approval record, never all inventory by default. */
export async function approveRecoveryReferencesIn(db: Db, input: { project: StoryboardProject, actor: MediaProjectActor, operationId: string, rootReferenceSetId: string, current: StoryboardReferenceSet, needed: NeededReference[], approvals: z.infer<typeof ReferenceRecoveryApprovalSchema>[], brandKitApproval?: z.infer<typeof BrandKitRecoveryApprovalSchema> }, deps: ReferenceDependencies) {
  const keys = input.approvals.map(a => `${a.sourceKind}:${a.assetId}`)
  if (new Set(keys).size !== keys.length || input.approvals.some(a => !input.needed.some(n => n.sourceKind === a.sourceKind && n.assetId === a.assetId && n.contentHash === a.expectedContentHash))) throw createError({ statusCode: 409, statusMessage: 'Reference approval must match this current edit' })
  const brandApproval = input.brandKitApproval ? BrandKitRecoveryApprovalSchema.parse(input.brandKitApproval) : undefined
  if (brandApproval && (!input.current.brandKit || input.current.brandKit.id !== brandApproval.id || input.current.brandKit.contentHash !== brandApproval.expectedPinnedHash)) throw createError({ statusCode: 409, statusMessage: 'Brand kit approval must match the currently pinned kit' })
  const pins = await pinReferencesIn(db, input.project, input.actor, input.approvals.flatMap((a) => {
    const roles = input.current.references.filter(r => r.sourceKind === a.sourceKind && r.assetId === a.assetId).map(r => r.role)
    return (roles.length ? roles : ['product' as const]).map(role => ({ ...a, role, decision: 'approved' as const }))
  }), brandApproval ? { id: brandApproval.id, expectedContentHash: brandApproval.expectedContentHash } : null, deps)
  const references = input.current.references.filter(r => !keys.includes(`${r.sourceKind}:${r.assetId}`)).concat(pins.references)
  if (references.length > 24) throw createError({ statusCode: 400, statusMessage: 'Too many reviewed references' })
  const id = randomUUID()
  // Canonical pinning rechecks current content under the caller's dependency
  // fences. Only this cut gets the approval; untouched inventory stays verbatim.
  if (brandApproval && (!pins.brandKit || pins.brandKit.id !== brandApproval.id || pins.brandKit.contentHash !== brandApproval.expectedContentHash)) throw createError({ statusCode: 409, statusMessage: 'Brand kit changed; refresh before approving' })
  const brandKit = brandApproval && pins.brandKit ? { ...pins.brandKit, approval: { actorId: input.actor.id, approvedAt: new Date().toISOString(), contentHash: pins.brandKit.contentHash, evidence: brandApproval.evidence } } : input.current.brandKit
  const data = { references, brandKit, reviewScope: { rootReferenceSetId: input.rootReferenceSetId } }
  const row = (await db.query(`INSERT INTO video_storyboard_reference_sets (id,project_id,sequence,parent_id,reference_data,content_hash,operation_id,request_hash,created_by)
    VALUES ($1,$2,COALESCE((SELECT MAX(sequence) FROM video_storyboard_reference_sets WHERE project_id=$2),0)+1,$3,$4,$5,$6,$7,$8) RETURNING *`, [id, input.project.id, input.current.id, JSON.stringify(data), storyboardHash(data), input.operationId, storyboardHash({ references: input.approvals, brandKitApproval: brandApproval ?? null }), input.actor.id])).rows[0]
  return { ...input.current, ...data, id, sequence: row.sequence, parentId: input.current.id, contentHash: row.content_hash } as StoryboardReferenceSet
}

/** Recovery inventory is immutable and attached only to a review/its lineage.
 * The original global authority token remains a revocation fence: any later
 * global decision change requires fresh review, including explicit revocation.
 * Canonical source/actor/font eligibility is still checked separately each time. */
export async function resolveTimelineReferenceSetIn(db: Db, global: StoryboardReferenceSet, referenceSetId: string | null) {
  if (!referenceSetId || referenceSetId === global.id) return { referenceSet: global, current: true }
  const row = (await db.query('SELECT * FROM video_storyboard_reference_sets WHERE project_id=$1 AND id=$2', [global.projectId, referenceSetId])).rows[0]
  const scope = row?.reference_data?.reviewScope
  if (!row || typeof scope?.rootReferenceSetId !== 'string') return { referenceSet: global, current: false }
  const referenceSet: StoryboardReferenceSet = { id: row.id, projectId: row.project_id, sequence: row.sequence, parentId: row.parent_id,
    references: row.reference_data.references, brandKit: row.reference_data.brandKit, contentHash: row.content_hash, createdBy: row.created_by, createdAt: row.created_at }
  return { referenceSet, current: scope.rootReferenceSetId === global.id }
}
