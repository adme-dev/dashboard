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
    action_items_content: string | null
    viewer_count: number
    average_percent_watched: number | null
    recent_views: OfficeRecordingRecentView[]
  }>(
    `SELECT r.*,
            oms.title AS meeting_title,
            actions.content AS action_items_content,
            COALESCE(view_stats.viewer_count, 0)::int AS viewer_count,
            view_stats.average_percent_watched,
            COALESCE(views.recent_views, '[]'::json) AS recent_views
     FROM office_recordings r
     LEFT JOIN office_meeting_sessions oms
       ON oms.id = r.meeting_session_id
      AND oms.office_id = r.office_id
     LEFT JOIN LATERAL (
       SELECT content
       FROM office_meeting_artifacts
       WHERE meeting_session_id = r.meeting_session_id
         AND artifact_type = 'action_items'
         AND metadata->>'source' = 'office_recording_transcription'
         AND metadata->>'recording_id' = r.id::text
       ORDER BY created_at DESC
       LIMIT 1
     ) actions ON true
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
         FROM (
           SELECT viewer_email,
                  viewer_key,
                  percent_watched,
                  watched_seconds,
                  MAX(created_at) OVER (
                    PARTITION BY COALESCE(NULLIF(lower(viewer_email), ''), NULLIF(viewer_key, ''), id::text)
                  ) AS created_at,
                  ROW_NUMBER() OVER (
                    PARTITION BY COALESCE(NULLIF(lower(viewer_email), ''), NULLIF(viewer_key, ''), id::text)
                    ORDER BY percent_watched DESC, created_at DESC
                  ) AS viewer_rank
           FROM office_recording_views
           WHERE recording_id = r.id
         ) ranked_views
         WHERE viewer_rank = 1
         ORDER BY created_at DESC
         LIMIT 5
     ) view_rows
    ) views ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS viewer_count,
             ROUND(AVG(best_percent)::numeric, 1)::float AS average_percent_watched
      FROM (
        SELECT
          COALESCE(NULLIF(lower(viewer_email), ''), NULLIF(viewer_key, ''), id::text) AS viewer_identity,
          MAX(percent_watched) AS best_percent
        FROM office_recording_views
        WHERE recording_id = r.id
        GROUP BY viewer_identity
      ) viewer_progress
    ) view_stats ON true
     WHERE r.office_id = $1
       AND ($2::boolean OR r.status <> 'archived')
     ORDER BY r.created_at DESC
     LIMIT 40`,
    [officeId, includeArchived]
  )

  return { recordings }
})
