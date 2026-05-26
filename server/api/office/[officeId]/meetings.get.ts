/**
 * GET /api/office/:officeId/meetings
 * List recent meeting sessions for the office.
 */
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { ensureOfficeMeetingArtifactsTables } from '~~/server/utils/officeMeetingArtifacts'
import { ensureOfficeRecordingsTables } from '~~/server/utils/officeRecordings'
import type { OfficeMeetingSessionRow, OfficeMemberRow } from '~~/app/types/office'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const officeId = getRouterParam(event, 'officeId')
  if (!officeId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId required' })
  }

  const membership = await queryOne<OfficeMemberRow>(
    `SELECT * FROM office_members WHERE office_id = $1 AND user_id = $2`,
    [officeId, user.id]
  )
  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this office' })
  }

  await ensureOfficeMeetingArtifactsTables()
  await ensureOfficeRecordingsTables()
  const meetings = await queryRows<OfficeMeetingSessionRow & {
    zone_name: string | null
    zone_slug: string | null
    artifact_count: number
    artifact_types: string[]
    has_notes: boolean
    has_summary: boolean
    has_action_items: boolean
    has_guest_intake: boolean
    recording_count: number
    ready_recording_count: number
    draft_recording_count: number
    latest_recording_status: string | null
  }>(
    `SELECT oms.*,
            oz.name AS zone_name,
            oz.slug AS zone_slug,
            COUNT(oma.id)::int AS artifact_count,
            COALESCE(
              ARRAY_AGG(DISTINCT oma.artifact_type) FILTER (WHERE oma.id IS NOT NULL),
              '{}'::text[]
            ) AS artifact_types,
            COALESCE(BOOL_OR(oma.artifact_type = 'notes'), false) AS has_notes,
            COALESCE(BOOL_OR(oma.artifact_type = 'summary'), false) AS has_summary,
            COALESCE(BOOL_OR(oma.artifact_type = 'action_items'), false) AS has_action_items,
            COALESCE(BOOL_OR(oma.metadata->>'system_event' = 'guest_intake'), false) AS has_guest_intake,
            COALESCE(recording_summary.recording_count, 0)::int AS recording_count,
            COALESCE(recording_summary.ready_recording_count, 0)::int AS ready_recording_count,
            COALESCE(recording_summary.draft_recording_count, 0)::int AS draft_recording_count,
            recording_summary.latest_recording_status
     FROM office_meeting_sessions oms
     LEFT JOIN office_zones oz ON oz.id = oms.zone_id
     LEFT JOIN office_meeting_artifacts oma ON oma.meeting_session_id = oms.id
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS recording_count,
              COUNT(*) FILTER (WHERE status = 'ready')::int AS ready_recording_count,
              COUNT(*) FILTER (WHERE status IN ('draft', 'processing'))::int AS draft_recording_count,
              (ARRAY_AGG(status ORDER BY created_at DESC))[1] AS latest_recording_status
       FROM office_recordings
       WHERE meeting_session_id = oms.id
         AND status <> 'archived'
     ) recording_summary ON TRUE
     WHERE oms.office_id = $1
     GROUP BY oms.id, oz.name, oz.slug, recording_summary.recording_count, recording_summary.ready_recording_count, recording_summary.draft_recording_count, recording_summary.latest_recording_status
     ORDER BY
       CASE
         WHEN oms.status = 'live' THEN 0
         WHEN oms.status = 'planned' THEN 1
         ELSE 2
       END ASC,
       CASE
         WHEN oms.status IN ('live', 'planned')
          AND (oms.consent #>> '{setup,scheduled_start_at}') ~ '^\\d{4}-\\d{2}-\\d{2}T'
         THEN (oms.consent #>> '{setup,scheduled_start_at}')::timestamptz
         ELSE NULL
       END ASC NULLS LAST,
       oms.created_at DESC
     LIMIT 40`,
    [officeId]
  )

  return { meetings }
})
