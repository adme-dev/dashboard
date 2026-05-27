/**
 * PATCH /api/office/:officeId/meetings/:meetingId
 * Update meeting session lifecycle and basic metadata.
 */
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { logOfficeAuditEvent } from '~~/server/utils/officeAudit'
import { createMeetingActionItemsFromArtifact, createMeetingCloseoutArtifact, ensureOfficeMeetingArtifactsTables, prepareMeetingActionItemsForFollowUp } from '~~/server/utils/officeMeetingArtifacts'
import { generateMeetingActionItemsFromTranscript, generateMeetingSummaryFromTranscript } from '~~/server/utils/officeTranscription'
import { normalizeOfficeMeetingGuestEmails } from '~~/server/utils/officeMeetingGuests'
import { ensureOfficeMeetingThreadChannel } from '~~/server/utils/officeThreads'
import type { OfficeMeetingArtifactRow, OfficeMeetingSessionRow, OfficeMemberRow } from '~~/app/types/office'

const GuestEmail = z.string().trim().email()

const Body = z.object({
  status: z.enum(['planned', 'live', 'ended', 'cancelled']).optional(),
  title: z.string().trim().min(1).max(160).optional(),
  zone_id: z.string().uuid().nullable().optional(),
  meeting_type: z.enum(['general', 'client_review', 'sales_call', 'support', 'standup', 'interview', 'all_hands']).optional(),
  context: z.string().trim().max(4000).optional(),
  intake_prompt: z.string().trim().max(280).nullable().optional(),
  scheduled_start_at: z.string().datetime().nullable().optional(),
  duration_minutes: z.number().int().min(15).max(480).nullable().optional(),
  guest_emails: z.array(GuestEmail).optional(),
  retention_days: z.number().int().positive().nullable().optional()
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const officeId = getRouterParam(event, 'officeId')
  const meetingId = getRouterParam(event, 'meetingId')
  if (!officeId || !meetingId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId and meetingId are required' })
  }

  const membership = await queryOne<OfficeMemberRow>(
    `SELECT * FROM office_members WHERE office_id = $1 AND user_id = $2`,
    [officeId, user.id]
  )
  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this office' })
  }

  await ensureOfficeMeetingArtifactsTables()
  const body = Body.parse(await readBody(event))
  const hasZonePatch = Object.hasOwn(body, 'zone_id')
  if (
    (body.status === 'live' && (!hasZonePatch || !body.zone_id))
    || (hasZonePatch && body.zone_id === null)
  ) {
    const current = await queryOne<Pick<OfficeMeetingSessionRow, 'id' | 'status' | 'zone_id'>>(
      `SELECT id, status, zone_id
       FROM office_meeting_sessions
       WHERE id = $1
         AND office_id = $2`,
      [meetingId, officeId]
    )
    if (!current) {
      throw createError({ statusCode: 404, statusMessage: 'Meeting session not found' })
    }
    const nextStatus = body.status ?? current.status
    const nextZoneId = hasZonePatch ? body.zone_id : current.zone_id
    if (nextStatus === 'live' && !nextZoneId) {
      throw createError({ statusCode: 400, statusMessage: 'Live meetings require a room' })
    }
  }
  const setupPatch: Record<string, unknown> = {}
  if (Object.hasOwn(body, 'meeting_type')) setupPatch.meeting_type = body.meeting_type
  if (Object.hasOwn(body, 'context')) setupPatch.context = body.context
  if (Object.hasOwn(body, 'intake_prompt')) setupPatch.intake_prompt = body.intake_prompt
  if (Object.hasOwn(body, 'scheduled_start_at')) setupPatch.scheduled_start_at = body.scheduled_start_at
  if (Object.hasOwn(body, 'duration_minutes')) setupPatch.duration_minutes = body.duration_minutes
  const guestEmails = normalizeOfficeMeetingGuestEmails(body.guest_emails ?? [])

  const session = await queryOne<OfficeMeetingSessionRow>(
    `UPDATE office_meeting_sessions
     SET status = COALESCE($1, status),
         title = COALESCE($2, title),
         retention_days = CASE WHEN $3::boolean THEN $4 ELSE retention_days END,
         guest_emails = CASE WHEN $5::boolean THEN $6::text[] ELSE guest_emails END,
         consent = CASE
           WHEN $7::boolean THEN jsonb_set(
             consent,
             '{setup}',
             COALESCE(consent->'setup', '{}'::jsonb) || $8::jsonb,
             true
           )
           ELSE consent
         END,
         zone_id = CASE WHEN $9::boolean THEN $10::uuid ELSE zone_id END,
         started_at = CASE
           WHEN $1 = 'live' AND started_at IS NULL THEN now()
           ELSE started_at
         END,
         ended_at = CASE
           WHEN $1 IN ('ended', 'cancelled') AND ended_at IS NULL THEN now()
           ELSE ended_at
         END,
         updated_at = now()
     WHERE id = $11
       AND office_id = $12
       AND (
         NOT $9::boolean
         OR $10::uuid IS NULL
         OR EXISTS (
           SELECT 1
           FROM office_zones oz
           WHERE oz.id = $10::uuid
             AND oz.office_id = $12
             AND oz.zone_type <> 'desk'
         )
       )
     RETURNING *`,
    [
      body.status ?? null,
      body.title ?? null,
      Object.hasOwn(body, 'retention_days'),
      body.retention_days ?? null,
      Object.hasOwn(body, 'guest_emails'),
      guestEmails,
      Object.keys(setupPatch).length > 0,
      JSON.stringify(setupPatch),
      Object.hasOwn(body, 'zone_id'),
      body.zone_id ?? null,
      meetingId,
      officeId
    ]
  )

  if (!session) {
    throw createError({ statusCode: 404, statusMessage: 'Meeting session not found' })
  }

  let guestAccessExpired = 0
  let guestBadgesExpired = 0
  let generatedSummaryArtifactId: string | undefined
  let generatedActionItemsArtifactId: string | undefined
  if (body.status === 'ended' || body.status === 'cancelled') {
    const expired = await queryOne<{ expired_count: number, badge_count: number }>(
      `WITH matching_requests AS (
         SELECT id
         FROM office_lobby_requests
         WHERE office_id = $1
           AND (
             message ~* ('(^|\\n)meeting id:\\s*' || $2 || '(\\s|\\n|$)')
             OR id = $4::uuid
           )
       ),
       expired AS (
         UPDATE office_lobby_requests
         SET status = 'expired',
             handled_by = $3,
             handled_at = now(),
             updated_at = now()
         WHERE id IN (SELECT id FROM matching_requests)
           AND status = 'accepted'
         RETURNING id
       ),
       expired_badges AS (
         UPDATE office_guest_badges ogb
         SET status = 'expired',
             revoked_by = $3,
             revoked_at = now(),
             updated_at = now()
         FROM expired
         WHERE ogb.office_id = $1
           AND ogb.lobby_request_id IN (SELECT id FROM matching_requests)
           AND ogb.status = 'active'
         RETURNING ogb.id
       )
       SELECT
         (SELECT COUNT(*)::int FROM expired) AS expired_count,
         (SELECT COUNT(*)::int FROM expired_badges) AS badge_count`,
      [officeId, meetingId, user.id, session.lobby_request_id ?? null]
    )
    guestAccessExpired = expired?.expired_count ?? 0
    guestBadgesExpired = expired?.badge_count ?? 0
    await createMeetingCloseoutArtifact({
      meetingSessionId: session.id,
      title: session.title,
      status: body.status,
      guestAccessExpired,
      guestBadgesExpired,
      createdBy: user.id
    })
    await prepareMeetingActionItemsForFollowUp({
      meetingSessionId: session.id,
      title: session.title,
      status: body.status,
      createdBy: user.id
    })

    if (body.status === 'ended') {
      const liveTranscript = await queryOne<{ id: string, content: string }>(
        `SELECT id, content
         FROM office_meeting_artifacts
         WHERE meeting_session_id = $1
           AND artifact_type = 'transcript'
           AND metadata->>'source' = 'office_live_transcription'
           AND length(trim(content)) > 0
         ORDER BY created_at DESC
         LIMIT 1`,
        [session.id]
      )

      if (liveTranscript?.content.trim()) {
        const generatedState = await queryOne<{ summary_id: string | null, action_items_id: string | null }>(
          `SELECT
             MAX(id::text) FILTER (WHERE artifact_type = 'summary') AS summary_id,
             MAX(id::text) FILTER (WHERE artifact_type = 'action_items') AS action_items_id
           FROM office_meeting_artifacts
           WHERE meeting_session_id = $1
             AND metadata->>'generated_from' = 'office_live_transcription'`,
          [session.id]
        )
        const existingActionItemsArtifact = generatedState?.action_items_id
          ? await queryOne<OfficeMeetingArtifactRow>(
              `SELECT *
               FROM office_meeting_artifacts
               WHERE id = $1
                 AND meeting_session_id = $2
                 AND artifact_type = 'action_items'
               LIMIT 1`,
              [generatedState.action_items_id, session.id]
            )
          : null
        generatedSummaryArtifactId = generatedState?.summary_id ?? undefined
        generatedActionItemsArtifactId = generatedState?.action_items_id ?? undefined

        if (!generatedState?.summary_id || !generatedState.action_items_id) {
          const summary = await generateMeetingSummaryFromTranscript({
            title: session.title,
            context: typeof session.consent?.setup?.context === 'string' ? session.consent.setup.context : undefined,
            transcript: liveTranscript.content
          })
          const actionItems = await generateMeetingActionItemsFromTranscript({
            title: session.title,
            transcript: liveTranscript.content
          })

          const metadata = {
            status: 'generated',
            source: 'office_meeting_closeout',
            generated_from: 'office_live_transcription',
            transcript_artifact_id: liveTranscript.id,
            generated_at: new Date().toISOString()
          }

          const summaryArtifact = generatedState?.summary_id
            ? null
            : await queryOne<OfficeMeetingArtifactRow>(
                `INSERT INTO office_meeting_artifacts (
                   meeting_session_id, artifact_type, title, content, metadata, created_by
                 )
                 VALUES ($1, 'summary', $2, $3, $4, $5)
                 RETURNING *`,
                [
                  session.id,
                  `${session.title} live summary`,
                  summary,
                  JSON.stringify(metadata),
                  user.id
                ]
              )
          const actionItemsArtifact = generatedState?.action_items_id
            ? null
            : await queryOne<OfficeMeetingArtifactRow>(
                `INSERT INTO office_meeting_artifacts (
                   meeting_session_id, artifact_type, title, content, metadata, created_by
                 )
                 VALUES ($1, 'action_items', $2, $3, $4, $5)
                 RETURNING *`,
                [
                  session.id,
                  `${session.title} live action items`,
                  actionItems,
                  JSON.stringify(metadata),
                  user.id
                ]
              )

          generatedSummaryArtifactId = summaryArtifact?.id ?? generatedSummaryArtifactId
          generatedActionItemsArtifactId = actionItemsArtifact?.id ?? generatedActionItemsArtifactId

          if (actionItemsArtifact) {
            await createMeetingActionItemsFromArtifact({
              officeId,
              artifact: actionItemsArtifact,
              actorId: user.id
            })
          }
          if (!actionItemsArtifact && existingActionItemsArtifact) {
            await createMeetingActionItemsFromArtifact({
              officeId,
              artifact: existingActionItemsArtifact,
              actorId: user.id
            })
          }

          const channel = await ensureOfficeMeetingThreadChannel({
            officeId,
            meetingId: session.id,
            actorId: user.id
          })
          if (channel) {
            await queryOne(
              `INSERT INTO chat_messages (channel_id, user_id, content, metadata)
               VALUES ($1, $2, $3, $4)
               RETURNING id`,
              [
                channel.id,
                user.id,
                [
                  `AI closeout generated for ${session.title}.`,
                  'Live transcript summary and action items were saved to meeting artifacts.'
                ].join('\n\n'),
                JSON.stringify({
                  source: 'office_live_transcription_closeout',
                  meeting_id: session.id,
                  transcript_artifact_id: liveTranscript.id,
                  summary_artifact_id: summaryArtifact?.id ?? generatedSummaryArtifactId,
                  action_items_artifact_id: actionItemsArtifact?.id ?? generatedActionItemsArtifactId
                })
              ]
            )
          }
        } else if (existingActionItemsArtifact) {
          await createMeetingActionItemsFromArtifact({
            officeId,
            artifact: existingActionItemsArtifact,
            actorId: user.id
          })
        }
      }
    }
  }

  await logOfficeAuditEvent({
    officeId,
    actorId: user.id,
    action: body.status ? `meeting.${body.status}` : 'meeting.updated',
    targetType: 'office_meeting_session',
    targetId: session.id,
    metadata: {
      title: body.title,
      status: body.status,
      zone_id: Object.hasOwn(body, 'zone_id') ? body.zone_id ?? null : undefined,
      meeting_type: body.meeting_type,
      intake_prompt: Object.hasOwn(body, 'intake_prompt') ? body.intake_prompt ?? null : undefined,
      scheduled_start_at: Object.hasOwn(body, 'scheduled_start_at') ? body.scheduled_start_at ?? null : undefined,
      duration_minutes: Object.hasOwn(body, 'duration_minutes') ? body.duration_minutes ?? null : undefined,
      guest_count: Object.hasOwn(body, 'guest_emails') ? guestEmails.length : undefined,
      retention_days: Object.hasOwn(body, 'retention_days') ? body.retention_days ?? null : undefined,
      guest_access_expired: guestAccessExpired || undefined,
      guest_badges_expired: guestBadgesExpired || undefined,
      generated_summary_artifact_id: generatedSummaryArtifactId,
      generated_action_items_artifact_id: generatedActionItemsArtifactId
    }
  })

  return {
    session,
    guestAccessExpired,
    guestBadgesExpired,
    generatedSummaryArtifactId,
    generatedActionItemsArtifactId
  }
})
