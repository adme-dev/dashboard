import { setHeader } from 'h3'
import { queryRows } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  await requireHrAdmin(event)

  const cycles = await queryRows(
    `SELECT c.id, c.name, c.purpose, c.status, c.timezone, c.opens_at, c.due_at, c.closes_at,
            COUNT(p.id)::int AS participant_count,
            COUNT(p.id) FILTER (WHERE p.status = 'submitted')::int AS submitted_count,
            COUNT(p.id) FILTER (
              WHERE p.status <> 'submitted' AND COALESCE(p.extension_due_at, c.due_at) < NOW()
            )::int AS overdue_count
     FROM hr_review_cycles c
     LEFT JOIN hr_review_participants p ON p.cycle_id = c.id
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
  )

  const participants = await queryRows(
    `SELECT participant.id, participant.cycle_id, participant.status,
            member.name AS member_name, member.email AS member_email,
            role.title AS role_title,
            assignment.id AS assignment_id, assignment.status AS assignment_status,
            assignment.due_at, assignment.extension_due_at, assignment.calendar_sequence,
            cycle.closes_at,
            response.status AS response_status,
            result.role_score, result.evidence_coverage, result.confidence,
            result.published_at AS score_published_at
     FROM hr_review_participants participant
     JOIN team_members member ON member.id = participant.team_member_id
     JOIN hr_review_cycles cycle ON cycle.id = participant.cycle_id
     LEFT JOIN hr_role_profile_versions role_version ON role_version.id = participant.role_profile_version_id
     LEFT JOIN hr_role_profiles role ON role.id = role_version.role_profile_id
     LEFT JOIN hr_questionnaire_assignments assignment ON assignment.participant_id = participant.id
     LEFT JOIN hr_responses response ON response.assignment_id = assignment.id
       AND response.respondent_id = participant.team_member_id
     LEFT JOIN LATERAL (
       SELECT * FROM hr_scorecard_results candidate
       WHERE candidate.participant_id = participant.id
       ORDER BY candidate.version DESC LIMIT 1
     ) result ON true
     ORDER BY member.name`,
  )

  return { cycles, participants }
})
