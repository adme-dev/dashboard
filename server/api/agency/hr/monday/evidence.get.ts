import { setHeader } from 'h3'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { getActiveMondayEvidenceScope } from '~~/server/utils/hr/mondayScope'
import { queryRows } from '~~/server/utils/db'

/**
 * Returns a deliberately small, read-only evidence view over records that have
 * already been synced into the task system. It is not a Monday mirror and it
 * never exposes source payloads, descriptions, comments, or communication data.
 */
export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireHrAdmin(event)
  const scope = await getActiveMondayEvidenceScope()

  if (!scope) {
    return { active: false, reason: 'NO_APPROVED_SCOPE', evidence: [], limitations: ['An owner-approved scope is required'] }
  }

  const evidence = await queryRows<{
    mondayBoardId: string
    mondayItemId: string
    taskId: string | null
    title: string
    assigneeId: string | null
    dueDate: string | null
    taskStatus: string | null
    isBlocked: boolean
    sourceCreatedAt: string
  }>(
    `SELECT monday_board_id AS "mondayBoardId", monday_item_id AS "mondayItemId",
            task_id AS "taskId", title, assignee_id AS "assigneeId",
            due_date AS "dueDate", status_name AS "taskStatus",
            COALESCE(is_blocked, false) AS "isBlocked", source_created_at AS "sourceCreatedAt"
       FROM hr_monday_evidence_extracts
      WHERE scope_id = $1 AND expires_at > NOW()
      ORDER BY observed_at DESC
      LIMIT 1000`,
    [scope.id],
  )

  // Enforce the approved field allowlist at the response boundary as well as
  // at scope creation. This keeps future query changes from widening access.
  const allowed = new Set(scope.allowed_fields.map(field => field.toLowerCase()))
  const redactedEvidence = evidence.map(item => ({
    mondayBoardId: item.mondayBoardId,
    mondayItemId: item.mondayItemId,
    taskId: item.taskId,
    title: allowed.has('name') || allowed.has('title') ? item.title : '[redacted by scope]',
    assigneeId: allowed.has('assignee') || allowed.has('assignee_id') ? item.assigneeId : null,
    dueDate: allowed.has('due_date') || allowed.has('due date') ? item.dueDate : null,
    taskStatus: allowed.has('status') ? item.taskStatus : null,
    isBlocked: allowed.has('blocked') || allowed.has('is_blocked') ? item.isBlocked : false,
    sourceCreatedAt: allowed.has('created_at') || allowed.has('created') ? item.sourceCreatedAt : null,
  }))

  await recordHrAuditEvent({
    actorId: user.id,
    action: 'monday_evidence.viewed',
    targetType: 'monday_evidence_scope',
    targetId: scope.id,
    metadata: { resultCount: redactedEvidence.length, boardCount: scope.board_ids.length },
  })

  return {
    active: true,
    scope: { id: scope.id, boardIds: scope.board_ids, allowedFields: scope.allowed_fields, periodStart: scope.period_start, periodEnd: scope.period_end },
    evidence: redactedEvidence,
    limitations: ['Only completed, already-synced task mappings are shown', 'No source payloads, descriptions, comments, or communication volume are included', 'This preview does not score employees or make performance determinations'],
  }
})
