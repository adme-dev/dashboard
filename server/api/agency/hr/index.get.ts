import { setHeader } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { canManageHr } from '~~/server/utils/hr/access'

type SummaryRow = {
  active_cycles: string | number
  people_in_review: string | number
  awaiting_response: string | number
  overdue: string | number
  roles_published: string | number
}

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireAuth(event)
  const isHrAdmin = canManageHr(user)

  const myAssignments = await queryRows(
    `SELECT qa.id,
            rc.name AS cycle_name,
            qv.name AS questionnaire_name,
            qa.status,
            qa.opens_at,
            COALESCE(qa.extension_due_at, qa.due_at) AS due_at,
            rp.title AS role_title
     FROM hr_questionnaire_assignments qa
     JOIN hr_review_participants participant ON participant.id = qa.participant_id
     JOIN hr_review_cycles rc ON rc.id = participant.cycle_id
     JOIN hr_questionnaire_versions qv ON qv.id = qa.questionnaire_version_id
     LEFT JOIN hr_role_profile_versions rpv ON rpv.id = participant.role_profile_version_id
     LEFT JOIN hr_role_profiles rp ON rp.id = rpv.role_profile_id
     WHERE participant.team_member_id = $1
     ORDER BY COALESCE(qa.extension_due_at, qa.due_at) ASC`,
    [user.id],
  )

  const myFollowUps = await queryRows(
    `SELECT follow_up.id, follow_up.action_type, follow_up.title, follow_up.description,
            follow_up.due_at, follow_up.status, follow_up.owner_id,
            owner.name AS owner_name, cycle.name AS cycle_name,
            participant.team_member_id AS participant_user_id
     FROM hr_follow_up_plans follow_up
     JOIN hr_review_participants participant ON participant.id = follow_up.participant_id
     JOIN hr_review_cycles cycle ON cycle.id = participant.cycle_id
     JOIN team_members owner ON owner.id = follow_up.owner_id
     WHERE (participant.team_member_id = $1 AND follow_up.visibility = 'participant_and_hr')
        OR follow_up.owner_id = $1
       AND follow_up.status NOT IN ('completed', 'cancelled')
     ORDER BY follow_up.due_at`,
    [user.id],
  )

  if (!isHrAdmin) {
    return { access: 'participant', myAssignments, myFollowUps }
  }

  const [summary, onboarding, recentCycles] = await Promise.all([
    queryOne<SummaryRow>(
      `SELECT
         (SELECT COUNT(*) FROM hr_review_cycles WHERE status IN ('scheduled', 'open')) AS active_cycles,
         (SELECT COUNT(*) FROM hr_review_participants p
            JOIN hr_review_cycles c ON c.id = p.cycle_id
           WHERE c.status IN ('scheduled', 'open')) AS people_in_review,
         (SELECT COUNT(*) FROM hr_questionnaire_assignments WHERE status IN ('scheduled', 'open', 'in_progress')) AS awaiting_response,
         (SELECT COUNT(*) FROM hr_questionnaire_assignments
           WHERE status <> 'submitted'
             AND COALESCE(extension_due_at, due_at) < NOW()) AS overdue,
         (SELECT COUNT(*) FROM hr_role_profile_versions WHERE status = 'published') AS roles_published`,
    ),
    queryOne<{ status: string, current_step: number }>(
      `SELECT status, current_step
       FROM hr_owner_onboarding_sessions
       WHERE owner_id = $1 AND status <> 'archived'
       ORDER BY created_at DESC LIMIT 1`,
      [user.id],
    ),
    queryRows(
      `SELECT id, name, status, opens_at, due_at, closes_at,
              (SELECT COUNT(*) FROM hr_review_participants p WHERE p.cycle_id = c.id) AS participant_count
       FROM hr_review_cycles c
       ORDER BY created_at DESC
       LIMIT 5`,
    ),
  ])

  return {
    access: 'hr_admin',
    onboarding: onboarding
      ? { status: onboarding.status, currentStep: onboarding.current_step }
      : { status: 'not_started', currentStep: 1 },
    summary: {
      activeCycles: Number(summary?.active_cycles ?? 0),
      peopleInReview: Number(summary?.people_in_review ?? 0),
      awaitingResponse: Number(summary?.awaiting_response ?? 0),
      overdue: Number(summary?.overdue ?? 0),
      rolesPublished: Number(summary?.roles_published ?? 0),
    },
    recentCycles,
    myAssignments,
    myFollowUps,
  }
})
