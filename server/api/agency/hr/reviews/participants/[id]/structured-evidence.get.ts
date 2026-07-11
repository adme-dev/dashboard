import { createError, getRouterParam, setHeader } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { canAccessHrParticipant } from '~~/server/utils/hr/access'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireAuth(event)
  const participantId = getRouterParam(event, 'id')
  if (!participantId || !/^[0-9a-f-]{36}$/i.test(participantId)) throw createError({ statusCode: 400, statusMessage: 'Invalid participant' })

  const participant = await queryOne<any>(
    `SELECT participant.id, participant.team_member_id, participant.reviewer_id,
            participant.role_profile_version_id, participant.cycle_id,
            cycle.opens_at, cycle.closes_at
       FROM hr_review_participants participant
       JOIN hr_review_cycles cycle ON cycle.id = participant.cycle_id
      WHERE participant.id = $1`,
    [participantId],
  )
  if (!participant || !canAccessHrParticipant(user, {
    participantUserId: participant.team_member_id,
    reviewerIds: participant.reviewer_id ? [participant.reviewer_id] : [],
  }, 'read')) throw createError({ statusCode: 403, statusMessage: 'You cannot view this structured evidence' })

  const [workload, tasks] = await Promise.all([
    queryOne<any>(
      `SELECT COUNT(entry.id)::int AS entry_count,
              COUNT(DISTINCT entry.project_id)::int AS project_count,
              COALESCE(SUM(entry.hours), 0)::numeric AS total_hours,
              COALESCE(SUM(entry.hours) FILTER (WHERE entry.billable), 0)::numeric AS billable_hours,
              COALESCE(SUM(entry.hours) FILTER (WHERE entry.approved), 0)::numeric AS approved_hours
         FROM time_entries entry
        WHERE entry.user_id = $1
          AND entry.date >= $2::timestamptz::date
          AND entry.date <= $3::timestamptz::date`,
      [participant.team_member_id, participant.opens_at, participant.closes_at],
    ),
    queryRows<any>(
      `SELECT DISTINCT ON (mapping.monday_item_id)
              mapping.monday_item_id AS source_id,
              mapping.monday_item_name AS source_label,
              task.id AS task_id, task.title, task.due_date,
              task.is_blocked, task.blocked_reason, task.status_is_final,
              status.name AS status_name,
              COALESCE(mapping.source_updated_at, task.updated_at) AS observed_at
         FROM hr_role_profile_versions role_version
         JOIN LATERAL jsonb_array_elements(COALESCE(role_version.source_refs, '[]'::jsonb)) source ON true
         JOIN monday_item_mappings mapping
           ON mapping.monday_item_id = source->>'sourceId'
          AND mapping.status = 'completed'
          AND NOT COALESCE(mapping.archived, false)
         JOIN tasks task ON task.id = mapping.task_id
         LEFT JOIN task_statuses status ON status.id = task.status_id
         JOIN hr_review_cycles cycle ON cycle.id = $2
        WHERE role_version.id = $1
          AND source->>'sourceType' = 'monday_item'
          AND COALESCE(mapping.source_updated_at, task.updated_at) >= cycle.opens_at
          AND COALESCE(mapping.source_updated_at, task.updated_at) <= cycle.closes_at
        ORDER BY mapping.monday_item_id, mapping.updated_at DESC`,
      [participant.role_profile_version_id, participant.cycle_id],
    ),
  ])

  await recordHrAuditEvent({
    actorId: user.id,
    action: 'structured_evidence.viewed',
    targetType: 'review_participant',
    targetId: participant.id,
    cycleId: participant.cycle_id,
    metadata: { taskReferenceCount: tasks.length },
  })

  return {
    period: { opensAt: participant.opens_at, closesAt: participant.closes_at },
    workload: {
      entryCount: Number(workload?.entry_count || 0),
      projectCount: Number(workload?.project_count || 0),
      totalHours: Number(workload?.total_hours || 0),
      billableHours: Number(workload?.billable_hours || 0),
      approvedHours: Number(workload?.approved_hours || 0),
    },
    tasks,
    limitations: {
      workload: 'Time entries show recorded workload only; they do not capture all work, quality, complexity, availability, or contribution.',
      tasks: 'Only Monday items explicitly referenced by the frozen role and observed within the review period are included.',
      mustNotBeUsedAsPerformanceRating: true,
      taskCountsAreNotProductivityScores: true,
    },
  }
})
