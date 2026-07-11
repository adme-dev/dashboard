import { createError, getRouterParam, setHeader } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { canAccessHrParticipant, canManageHr } from '~~/server/utils/hr/access'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireAuth(event)
  const participantId = getRouterParam(event, 'id')
  if (!participantId || !/^[0-9a-f-]{36}$/i.test(participantId)) throw createError({ statusCode: 400, statusMessage: 'Invalid participant' })
  const participant = await queryOne<{ team_member_id: string, reviewer_id: string | null, cycle_id: string }>(
    `SELECT team_member_id, reviewer_id, cycle_id FROM hr_review_participants WHERE id = $1`, [participantId]
  )
  if (!participant || !canAccessHrParticipant(user, {
    participantUserId: participant.team_member_id,
    reviewerIds: participant.reviewer_id ? [participant.reviewer_id] : []
  }, 'read')) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const canSeePrivateNotes = canManageHr(user) || user.id === participant.reviewer_id
  const interviews = await queryRows<{
    id: string
    status: string
    starts_at: string
    ends_at: string
    timezone: string
    location: string | null
    agenda: string
    participant_summary: string | null
    private_notes: string | null
    calendar_sequence: number
    completed_at: string | null
    cancelled_at: string | null
  }>(
    `SELECT id, status, starts_at, ends_at, timezone, location, agenda,
            participant_summary, private_notes, calendar_sequence,
            completed_at, cancelled_at
     FROM hr_review_interviews WHERE participant_id = $1 ORDER BY starts_at DESC`,
    [participantId]
  )
  await recordHrAuditEvent({
    actorId: user.id, action: 'review_interviews.viewed', targetType: 'review_participant',
    targetId: participantId, cycleId: participant.cycle_id
  })
  return {
    interviews: interviews.map(interview => ({
      id: interview.id,
      status: interview.status,
      startsAt: interview.starts_at,
      endsAt: interview.ends_at,
      timezone: interview.timezone,
      location: interview.location,
      agenda: interview.agenda,
      participantSummary: interview.participant_summary,
      privateNotes: canSeePrivateNotes ? interview.private_notes : null,
      calendarSequence: interview.calendar_sequence,
      completedAt: interview.completed_at,
      cancelledAt: interview.cancelled_at
    }))
  }
})
