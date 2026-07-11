import { createError, getRouterParam, setHeader } from 'h3'
import { getAppUrl } from '~~/server/utils/appUrl'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { canAccessHrParticipant } from '~~/server/utils/hr/access'
import { buildHrCalendarInvite } from '~~/server/utils/hr/schedule'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const assignmentId = getRouterParam(event, 'id')
  if (!assignmentId || !/^[0-9a-f-]{36}$/i.test(assignmentId)) throw createError({ statusCode: 400, statusMessage: 'Invalid assignment' })

  const assignment = await queryOne<any>(
    `SELECT qa.id, COALESCE(qa.extension_due_at, qa.due_at) AS due_at,
            qa.calendar_uid, qa.calendar_sequence,
            p.team_member_id, p.reviewer_id, c.id AS cycle_id, c.name AS cycle_name, c.timezone
     FROM hr_questionnaire_assignments qa
     JOIN hr_review_participants p ON p.id = qa.participant_id
     JOIN hr_review_cycles c ON c.id = p.cycle_id
     WHERE qa.id = $1`,
    [assignmentId],
  )
  if (!assignment) throw createError({ statusCode: 404, statusMessage: 'Assignment not found' })
  if (!canAccessHrParticipant(user, {
    participantUserId: assignment.team_member_id,
    reviewerIds: assignment.reviewer_id ? [assignment.reviewer_id] : [],
  }, 'read')) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const dueAt = new Date(assignment.due_at)
  const invite = buildHrCalendarInvite({
    uid: assignment.calendar_uid,
    method: 'REQUEST',
    startsAt: new Date(dueAt.getTime() - 15 * 60 * 1000).toISOString(),
    endsAt: dueAt.toISOString(),
    timezone: assignment.timezone,
    summary: `${assignment.cycle_name} due`,
    description: 'Complete your private business review. The calendar entry contains no questionnaire answers.',
    url: `${getAppUrl(event)}/agency/hr`,
    sequence: assignment.calendar_sequence,
  })

  setHeader(event, 'Cache-Control', 'private, no-store')
  setHeader(event, 'Content-Type', 'text/calendar; charset=utf-8; method=REQUEST')
  setHeader(event, 'Content-Disposition', `attachment; filename="business-review-${assignment.cycle_id}.ics"`)
  return invite
})
