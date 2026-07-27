/**
 * Client Portal - Meetings
 * GET /api/portal/meetings
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'

type PortalMeetingRow = {
  id: string
  office_id: string
  office_name: string
  title: string
  status: string
  source: string | null
  started_at: string | null
  ended_at: string | null
  created_at: string
  scheduled_start_at: string | null
  duration_minutes: string | number | null
  zone_name: string | null
  zone_slug: string | null
  ready_recording_count: string | number | null
  latest_recording_token: string | null
  summary_count: string | number | null
  action_item_artifact_count: string | number | null
  notes_count: string | number | null
  transcript_count: string | number | null
}

type MeetingStatsRow = {
  total_visible: string | number | null
  live: string | number | null
  planned: string | number | null
  ended: string | number | null
  recordings: string | number | null
  recordings_last_30: string | number | null
  summaries: string | number | null
  action_items: string | number | null
  notes: string | number | null
  transcripts: string | number | null
  completed_last_30: string | number | null
  missing_follow_up: string | number | null
  next_meeting_at: string | null
}

const mapMeeting = (meeting: PortalMeetingRow) => ({
  id: meeting.id,
  officeId: meeting.office_id,
  officeName: meeting.office_name,
  title: meeting.title,
  joinPath: `/lobby/${meeting.office_id}?meeting=${encodeURIComponent(String(meeting.id))}`,
  status: meeting.status,
  source: meeting.source,
  startedAt: meeting.started_at,
  endedAt: meeting.ended_at,
  createdAt: meeting.created_at,
  scheduledStartAt: meeting.scheduled_start_at,
  durationMinutes: meeting.duration_minutes ? Number(meeting.duration_minutes) : null,
  zoneName: meeting.zone_name,
  zoneSlug: meeting.zone_slug,
  readyRecordingCount: Number(meeting.ready_recording_count || 0),
  latestRecordingToken: meeting.latest_recording_token,
  artifacts: {
    summaries: Number(meeting.summary_count || 0),
    actionItems: Number(meeting.action_item_artifact_count || 0),
    notes: Number(meeting.notes_count || 0),
    transcripts: Number(meeting.transcript_count || 0)
  }
})

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)
  const query = getQuery(event)
  const view = query.view as string | undefined
  const limit = Math.min(Number(query.limit) || 50, 100)

  try {
    const conditions = ['om.client_user_id = $1', 'oms.status <> \'cancelled\'']
    if (view === 'upcoming') {
      conditions.push('oms.status IN (\'live\', \'planned\')')
    } else if (view === 'history') {
      conditions.push('oms.status NOT IN (\'live\', \'planned\')')
    }

    const meetings = await queryRows<PortalMeetingRow>(`
      SELECT
        oms.id,
        oms.office_id,
        o.name AS office_name,
        oms.title,
        oms.status,
        oms.source,
        oms.started_at,
        oms.ended_at,
        oms.created_at,
        oms.consent #>> '{setup,scheduled_start_at}' AS scheduled_start_at,
        oms.consent #>> '{setup,duration_minutes}' AS duration_minutes,
        oz.name AS zone_name,
        oz.slug AS zone_slug,
        COALESCE(recording_summary.ready_recording_count, 0)::int AS ready_recording_count,
        recording_summary.latest_recording_token,
        COALESCE(artifact_summary.summary_count, 0)::int AS summary_count,
        COALESCE(artifact_summary.action_item_artifact_count, 0)::int AS action_item_artifact_count,
        COALESCE(artifact_summary.notes_count, 0)::int AS notes_count,
        COALESCE(artifact_summary.transcript_count, 0)::int AS transcript_count
      FROM office_members om
      JOIN offices o ON o.id = om.office_id
      JOIN office_meeting_sessions oms ON oms.office_id = om.office_id
      LEFT JOIN office_zones oz ON oz.id = oms.zone_id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE status = 'ready')::int AS ready_recording_count,
          (ARRAY_AGG(share_token ORDER BY created_at DESC) FILTER (WHERE status = 'ready' AND share_token IS NOT NULL))[1] AS latest_recording_token
        FROM office_recordings
        WHERE meeting_session_id = oms.id
          AND status <> 'archived'
      ) recording_summary ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE artifact_type = 'summary')::int AS summary_count,
          COUNT(*) FILTER (WHERE artifact_type = 'action_items')::int AS action_item_artifact_count,
          COUNT(*) FILTER (WHERE artifact_type = 'notes')::int AS notes_count,
          COUNT(*) FILTER (WHERE artifact_type = 'transcript')::int AS transcript_count
        FROM office_meeting_artifacts
        WHERE meeting_session_id = oms.id
      ) artifact_summary ON TRUE
      WHERE ${conditions.join(' AND ')}
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
        oms.ended_at DESC NULLS LAST,
        oms.created_at DESC
      LIMIT $2
    `, [clientUser.id, limit])

    const stats = await queryOne<MeetingStatsRow>(`
      SELECT
        COUNT(*) AS total_visible,
        COUNT(*) FILTER (WHERE oms.status = 'live') AS live,
        COUNT(*) FILTER (WHERE oms.status = 'planned') AS planned,
        COUNT(*) FILTER (WHERE oms.status NOT IN ('live', 'planned', 'cancelled')) AS ended,
        COALESCE(SUM(recording_summary.ready_recording_count), 0) AS recordings,
        COALESCE(SUM(recording_summary.ready_recording_last_30_count), 0) AS recordings_last_30,
        COALESCE(SUM(artifact_summary.summary_count), 0) AS summaries,
        COALESCE(SUM(artifact_summary.action_item_artifact_count), 0) AS action_items,
        COALESCE(SUM(artifact_summary.notes_count), 0) AS notes,
        COALESCE(SUM(artifact_summary.transcript_count), 0) AS transcripts,
        COUNT(*) FILTER (
          WHERE oms.status NOT IN ('live', 'planned', 'cancelled')
            AND COALESCE(oms.ended_at, oms.created_at) >= NOW() - INTERVAL '30 days'
        ) AS completed_last_30,
        COUNT(*) FILTER (
          WHERE oms.status NOT IN ('live', 'planned', 'cancelled')
            AND COALESCE(artifact_summary.summary_count, 0) = 0
            AND COALESCE(artifact_summary.action_item_artifact_count, 0) = 0
            AND COALESCE(recording_summary.ready_recording_count, 0) = 0
        ) AS missing_follow_up,
        MIN(
          CASE
            WHEN oms.status IN ('live', 'planned')
             AND (oms.consent #>> '{setup,scheduled_start_at}') ~ '^\\d{4}-\\d{2}-\\d{2}T'
            THEN (oms.consent #>> '{setup,scheduled_start_at}')::timestamptz
            WHEN oms.status IN ('live', 'planned') THEN oms.started_at
            ELSE NULL
          END
        ) AS next_meeting_at
      FROM office_members om
      JOIN office_meeting_sessions oms ON oms.office_id = om.office_id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE status = 'ready')::int AS ready_recording_count,
          COUNT(*) FILTER (WHERE status = 'ready' AND created_at >= NOW() - INTERVAL '30 days')::int AS ready_recording_last_30_count
        FROM office_recordings
        WHERE meeting_session_id = oms.id
          AND status <> 'archived'
      ) recording_summary ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE artifact_type = 'summary')::int AS summary_count,
          COUNT(*) FILTER (WHERE artifact_type = 'action_items')::int AS action_item_artifact_count,
          COUNT(*) FILTER (WHERE artifact_type = 'notes')::int AS notes_count,
          COUNT(*) FILTER (WHERE artifact_type = 'transcript')::int AS transcript_count
        FROM office_meeting_artifacts
        WHERE meeting_session_id = oms.id
      ) artifact_summary ON TRUE
      WHERE om.client_user_id = $1
        AND oms.status <> 'cancelled'
    `, [clientUser.id])

    return {
      meetings: meetings.map(mapMeeting),
      stats: {
        totalVisible: Number(stats?.total_visible || 0),
        live: Number(stats?.live || 0),
        planned: Number(stats?.planned || 0),
        ended: Number(stats?.ended || 0),
        recordings: Number(stats?.recordings || 0),
        recordingsLast30: Number(stats?.recordings_last_30 || 0),
        summaries: Number(stats?.summaries || 0),
        actionItems: Number(stats?.action_items || 0),
        notes: Number(stats?.notes || 0),
        transcripts: Number(stats?.transcripts || 0),
        completedLast30: Number(stats?.completed_last_30 || 0),
        missingFollowUp: Number(stats?.missing_follow_up || 0),
        nextMeetingAt: stats?.next_meeting_at || null
      }
    }
  } catch (error) {
    console.error('Failed to fetch portal meetings:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch meetings' })
  }
})
