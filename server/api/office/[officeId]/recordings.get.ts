/**
 * GET /api/office/:officeId/recordings
 * List async office recordings.
 */
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { ensureOfficeRecordingsTables } from '~~/server/utils/officeRecordings'
import type { OfficeMemberRow, OfficeRecordingRow } from '~~/app/types/office'

export type OfficeRecordingRecentView = {
  viewer_email: string | null
  viewer_key: string | null
  percent_watched: number
  watched_seconds: number
  created_at: string
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const officeId = getRouterParam(event, 'officeId')
  if (!officeId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId required' })
  }
  const query = getQuery(event)
  const includeArchived = query.includeArchived === 'true'

  const membership = await queryOne<OfficeMemberRow>(
    `SELECT * FROM office_members WHERE office_id = $1 AND user_id = $2`,
    [officeId, user.id]
  )
  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this office' })
  }

  await ensureOfficeRecordingsTables()
  const recordings = await queryRows<OfficeRecordingRow & {
    meeting_title: string | null
    recent_views: OfficeRecordingRecentView[]
  }>(
    `SELECT r.*,
            oms.title AS meeting_title,
            COALESCE(views.recent_views, '[]'::json) AS recent_views
     FROM office_recordings r
     LEFT JOIN office_meeting_sessions oms
       ON oms.id = r.meeting_session_id
      AND oms.office_id = r.office_id
     LEFT JOIN LATERAL (
       SELECT json_agg(
                json_build_object(
                  'viewer_email', view_rows.viewer_email,
                  'viewer_key', view_rows.viewer_key,
                  'percent_watched', view_rows.percent_watched,
                  'watched_seconds', view_rows.watched_seconds,
                  'created_at', view_rows.created_at
                )
                ORDER BY view_rows.created_at DESC
              ) AS recent_views
       FROM (
         SELECT viewer_email, viewer_key, percent_watched, watched_seconds, created_at
         FROM office_recording_views
         WHERE recording_id = r.id
         ORDER BY created_at DESC
         LIMIT 5
       ) view_rows
     ) views ON true
     WHERE r.office_id = $1
       AND ($2::boolean OR r.status <> 'archived')
     ORDER BY r.created_at DESC
     LIMIT 40`,
    [officeId, includeArchived]
  )

  return { recordings }
})
