import { createError, getRouterParam, setHeader } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { canAccessHrParticipant, canManageHr } from '~~/server/utils/hr/access'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireAuth(event)
  const assignmentId = getRouterParam(event, 'id')
  if (!assignmentId || !/^[0-9a-f-]{36}$/i.test(assignmentId)) throw createError({ statusCode: 400, statusMessage: 'Invalid assignment' })

  const assignment = await queryOne<any>(
    `SELECT qa.id, qa.status, qa.opens_at, qa.due_at, qa.extension_due_at,
            participant.id AS participant_id, participant.team_member_id, participant.reviewer_id,
            role_assignment.acknowledgement_status AS role_acknowledgement_status,
            role_assignment.acknowledgement_note AS role_acknowledgement_note,
            cycle.id AS cycle_id, cycle.name AS cycle_name, cycle.closes_at,
            qv.name AS questionnaire_name, qv.questions,
            rp.title AS role_title, rpv.purpose AS role_purpose,
            rpv.responsibilities, rpv.expected_outcomes,
            (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'id', kpi.id,
                'name', kpi.name,
                'description', kpi.description,
                'unit', kpi.unit,
                'direction', kpi.direction,
                'targetValue', kpi.target_value,
                'targetMin', kpi.target_min,
                'targetMax', kpi.target_max,
                'targetDescription', kpi.target_description,
                'cadence', kpi.cadence,
                'sourceType', kpi.source_type,
                'sourceRef', kpi.source_ref,
                'weight', kpi.weight,
                'departmentGoal', goal.name
              ) ORDER BY kpi.name), '[]'::jsonb)
             FROM hr_role_kpi_definitions kpi
             LEFT JOIN hr_role_kpi_goal_links goal_link ON goal_link.kpi_definition_id = kpi.id
             LEFT JOIN hr_department_goal_versions goal_version ON goal_version.id = goal_link.department_goal_version_id
             LEFT JOIN hr_department_goals goal ON goal.id = goal_version.goal_id
             WHERE kpi.role_profile_version_id = rpv.id AND kpi.status = 'active') AS role_kpis,
            response.id AS response_id, response.status AS response_status,
            response.answers, response.submitted_at
     FROM hr_questionnaire_assignments qa
     JOIN hr_review_participants participant ON participant.id = qa.participant_id
     JOIN hr_review_cycles cycle ON cycle.id = participant.cycle_id
     JOIN hr_questionnaire_versions qv ON qv.id = qa.questionnaire_version_id
     LEFT JOIN hr_role_profile_versions rpv ON rpv.id = participant.role_profile_version_id
     LEFT JOIN hr_role_profiles rp ON rp.id = rpv.role_profile_id
     LEFT JOIN hr_role_assignments role_assignment
       ON role_assignment.team_member_id = participant.team_member_id
      AND role_assignment.role_profile_version_id = participant.role_profile_version_id
      AND role_assignment.effective_to IS NULL
     LEFT JOIN hr_responses response ON response.assignment_id = qa.id
       AND response.respondent_id = participant.team_member_id
     WHERE qa.id = $1`,
    [assignmentId],
  )
  if (!assignment) throw createError({ statusCode: 404, statusMessage: 'Assignment not found' })

  const scope = {
    participantUserId: assignment.team_member_id,
    reviewerIds: assignment.reviewer_id ? [assignment.reviewer_id] : [],
  }
  if (!canAccessHrParticipant(user, scope, 'read')) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const isParticipant = user.id === assignment.team_member_id
  const canSeeAnswers = isParticipant || ['submitted', 'locked'].includes(assignment.response_status)
  await recordHrAuditEvent({
    actorId: user.id,
    action: 'questionnaire_assignment.viewed',
    targetType: 'questionnaire_assignment',
    targetId: assignment.id,
    cycleId: assignment.cycle_id,
    metadata: { relationship: isParticipant ? 'participant' : canManageHr(user) ? 'hr_admin' : 'reviewer' },
  })

  return {
    assignment: {
      id: assignment.id,
      participantId: assignment.participant_id,
      roleAcknowledgement: {
        status: assignment.role_acknowledgement_status || 'pending',
        note: assignment.role_acknowledgement_note || null,
      },
      status: assignment.status,
      opensAt: assignment.opens_at,
      dueAt: assignment.extension_due_at || assignment.due_at,
      closesAt: assignment.closes_at,
      cycleId: assignment.cycle_id,
      cycleName: assignment.cycle_name,
      questionnaireName: assignment.questionnaire_name,
      role: {
        title: assignment.role_title,
        purpose: assignment.role_purpose,
        responsibilities: assignment.responsibilities || [],
        expectedOutcomes: assignment.expected_outcomes || [],
        kpis: assignment.role_kpis || [],
      },
      questions: assignment.questions,
      canRespond: isParticipant && assignment.status !== 'closed'
        && !['submitted', 'locked'].includes(assignment.response_status)
        && Date.now() <= Date.parse(assignment.closes_at),
    },
    response: canSeeAnswers
      ? { id: assignment.response_id, status: assignment.response_status || 'draft', answers: assignment.answers || {}, submittedAt: assignment.submitted_at }
      : null,
  }
})
