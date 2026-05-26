import { queryOne, queryRows } from '~~/server/utils/db'
import { ensureOfficeGuestBadgesTable } from '~~/server/utils/officeGuestBadges'
import { ensureOfficeLobbyRequestsTable, OFFICE_LOBBY_ACCEPTED_WINDOW_HOURS, OFFICE_LOBBY_PENDING_WINDOW_MINUTES } from '~~/server/utils/officeLobbyRequests'
import { ensureOfficeMeetingArtifactsTables } from '~~/server/utils/officeMeetingArtifacts'
import { ensureOfficeRecordingsTables } from '~~/server/utils/officeRecordings'
import { deleteFile } from '~~/server/utils/storage'

interface CountRow {
  count: string | number
}

interface ExpiredRecordingAssetRow {
  storage_key: string | null
  thumbnail_key: string | null
}

export interface OfficeRetentionResult {
  archivedRecordings: number
  deletedRecordingAssets: number
  failedRecordingAssetDeletes: number
  deletedMeetingSessions: number
  expiredLobbyRequests: number
  expiredGuestBadges: number
}

function isDeletableStorageKey(value?: string | null) {
  return Boolean(value)
    && !/^https?:\/\//i.test(value || '')
    && !(value || '').startsWith('/')
    && !(value || '').split('/').some(segment => segment === '..')
}

async function deleteRecordingAssets(rows: ExpiredRecordingAssetRow[]) {
  const keys = [...new Set(rows
    .flatMap(row => [row.storage_key, row.thumbnail_key])
    .filter(isDeletableStorageKey) as string[])]
  let deleted = 0
  let failed = 0

  for (const key of keys) {
    try {
      await deleteFile(key)
      deleted += 1
    } catch (err) {
      failed += 1
      console.warn('[OfficeRetention] Failed to delete recording asset:', key, err)
    }
  }

  return { deleted, failed }
}

export async function runOfficeRetentionCleanup(): Promise<OfficeRetentionResult> {
  await ensureOfficeLobbyRequestsTable()
  await ensureOfficeGuestBadgesTable()
  await ensureOfficeMeetingArtifactsTables()
  await ensureOfficeRecordingsTables()

  const lobbyRequests = await queryOne<CountRow>(
    `WITH expired AS (
       UPDATE office_lobby_requests
       SET status = 'expired',
           handled_at = COALESCE(handled_at, now()),
           updated_at = now()
       WHERE (
           status = 'pending'
           AND COALESCE(scheduled_start_at, created_at) < now() - interval '${OFFICE_LOBBY_PENDING_WINDOW_MINUTES} minutes'
         )
         OR (
           status = 'accepted'
           AND handled_at IS NOT NULL
           AND handled_at < now() - interval '${OFFICE_LOBBY_ACCEPTED_WINDOW_HOURS} hours'
         )
       RETURNING id
     )
     SELECT COUNT(*)::int AS count FROM expired`
  )

  const guestBadges = await queryOne<CountRow>(
    `WITH expired AS (
       UPDATE office_guest_badges
       SET status = 'expired',
           revoked_at = COALESCE(revoked_at, now()),
           updated_at = now()
       WHERE status = 'active'
         AND expires_at <= now()
       RETURNING id
     )
     SELECT COUNT(*)::int AS count FROM expired`
  )

  const expiredRecordingAssets = await queryRows<ExpiredRecordingAssetRow>(
    `SELECT storage_key, thumbnail_key
     FROM office_recordings
     WHERE status <> 'archived'
       AND retention_days IS NOT NULL
       AND created_at < now() - (retention_days::text || ' days')::interval`
  )
  const recordingAssets = await deleteRecordingAssets(expiredRecordingAssets)

  const recordings = await queryOne<CountRow>(
    `WITH expired AS (
       UPDATE office_recordings
       SET status = 'archived',
           share_token = NULL,
           storage_key = NULL,
           thumbnail_key = NULL,
           updated_at = now()
       WHERE status <> 'archived'
         AND retention_days IS NOT NULL
         AND created_at < now() - (retention_days::text || ' days')::interval
       RETURNING id
     )
     SELECT COUNT(*)::int AS count FROM expired`
  )

  const meetings = await queryOne<CountRow>(
    `WITH expired AS (
       DELETE FROM office_meeting_sessions
       WHERE retention_days IS NOT NULL
         AND status IN ('ended', 'cancelled')
         AND COALESCE(ended_at, updated_at, created_at) < now() - (retention_days::text || ' days')::interval
       RETURNING id
     )
     SELECT COUNT(*)::int AS count FROM expired`
  )

  return {
    archivedRecordings: Number(recordings?.count ?? 0),
    deletedRecordingAssets: recordingAssets.deleted,
    failedRecordingAssetDeletes: recordingAssets.failed,
    deletedMeetingSessions: Number(meetings?.count ?? 0),
    expiredLobbyRequests: Number(lobbyRequests?.count ?? 0),
    expiredGuestBadges: Number(guestBadges?.count ?? 0)
  }
}
