import type { GodModeTransactionDb as Db } from '~~/server/utils/godMode/transactionCoordinator'
import type { StoryboardObligations } from '~~/shared/video/storyboardCompile'
import { storyboardApprovalChanges } from '~~/shared/video/storyboardCompile'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'
import { storyboardHash } from './hash'

export interface TimelineObligationRecord {
  applicationId: string
  contract: StoryboardObligations
  baseline: TimelineState
  referenceSetId: string | null
  review: { id: string, createdAt: string, operationId: string } | null
}
/** Exact revision only. A deleted/missing clip never removes this row. */
export async function loadTimelineObligationsIn(db: Db, projectId: string, timelineId: string, editRevision: number): Promise<TimelineObligationRecord | null> {
  const row = (await db.query(`SELECT o.*, a.receipt, r.contract AS reviewed_contract, r.baseline_state AS reviewed_baseline,
      r.reference_set_id AS reviewed_references, r.id AS review_id, r.created_at AS reviewed_at, r.operation_id AS review_operation_id
    FROM video_storyboard_timeline_obligations o
    JOIN video_storyboard_applications a ON a.id = o.application_id AND a.project_id = o.project_id
    LEFT JOIN LATERAL (SELECT * FROM video_storyboard_timeline_reviews WHERE timeline_id = o.timeline_id AND edit_revision = o.edit_revision ORDER BY created_at DESC, id DESC LIMIT 1) r ON TRUE
    WHERE o.project_id = $1 AND o.timeline_id = $2 AND o.edit_revision = $3`, [projectId, timelineId, editRevision])).rows[0]
  if (!row) return null
  return { applicationId: row.application_id, contract: row.reviewed_contract ?? row.contract,
    baseline: row.reviewed_baseline ?? row.review_state?.baselineState ?? row.receipt.afterState,
    referenceSetId: row.reviewed_references ?? row.review_state?.referenceSetId ?? null,
    review: row.review_id ? { id: row.review_id, createdAt: row.reviewed_at, operationId: row.review_operation_id } : null }
}
/** Called in the same transaction as every ordinary draft/version/render fork. */
export async function carryTimelineObligationsIn(db: Db, input: {
  projectId: string
  fromTimelineId: string
  fromEditRevision: number
  timelineId: string
  editRevision: number
  state: TimelineState
  actorId: string
}) {
  const prior = await loadTimelineObligationsIn(db, input.projectId, input.fromTimelineId, input.fromEditRevision)
  if (!prior) return
  const changes = storyboardApprovalChanges(prior.baseline, input.state, prior.contract)
  await db.query(`INSERT INTO video_storyboard_timeline_obligations
    (project_id,timeline_id,edit_revision,application_id,contract,contract_hash,review_state,created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [input.projectId, input.timelineId, input.editRevision, prior.applicationId,
    JSON.stringify(prior.contract), storyboardHash(prior.contract), JSON.stringify({ status: changes.length ? 'needs_review' : 'reviewed', changes, baselineState: prior.baseline, referenceSetId: prior.referenceSetId }), input.actorId])
}
