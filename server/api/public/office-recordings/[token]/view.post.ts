/**
 * POST /api/public/office-recordings/:token/view
 * Anonymous/internal viewer analytics for shared recordings.
 */
import { z } from 'zod'
import { execute, queryOne } from '~~/server/utils/db'
import { ensureOfficeRecordingsTables } from '~~/server/utils/officeRecordings'
import { verifyPassword } from '~~/server/utils/auth'

const Body = z.object({
  viewerEmail: z.string().email().nullable().optional(),
  viewerId: z.string().trim().min(8).max(120).nullable().optional(),
  password: z.string().max(200).optional(),
  percentWatched: z.number().finite().default(0),
  watchedSeconds: z.number().int().default(0),
  countView: z.boolean().default(true)
})

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeViewerEmail(value?: string | null) {
  const email = value?.trim().toLowerCase()
  return email || null
}

function normalizeViewerId(value?: string | null) {
  const id = value?.trim().toLowerCase()
  return id || null
}

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'token required' })
  }

  await ensureOfficeRecordingsTables()
  const body = Body.parse(await readBody(event))
  const recording = await queryOne<{ id: string, duration_seconds: number | null, access: string, password_hash: string | null }>(
    `SELECT id, duration_seconds, access, password_hash
     FROM office_recordings
     WHERE share_token = $1
       AND access IN ('public', 'password')
       AND status = 'ready'
       AND storage_key IS NOT NULL
     LIMIT 1`,
    [token]
  )
  if (!recording) {
    throw createError({ statusCode: 404, statusMessage: 'Recording not found' })
  }
  if (recording.access === 'password') {
    if (!recording.password_hash || !body.password || !await verifyPassword(body.password, recording.password_hash)) {
      throw createError({ statusCode: 401, statusMessage: 'Recording password required' })
    }
  }

  const percentWatched = clampNumber(body.percentWatched, 0, 100)
  const maxWatchedSeconds = recording.duration_seconds && recording.duration_seconds > 0
    ? recording.duration_seconds
    : Number.MAX_SAFE_INTEGER
  const watchedSeconds = clampNumber(body.watchedSeconds, 0, maxWatchedSeconds)
  const viewerEmail = normalizeViewerEmail(body.viewerEmail)
  const viewerKey = normalizeViewerId(body.viewerId)

  if (viewerEmail || viewerKey) {
    const existingView = await queryOne<{ id: string }>(
      `SELECT id
       FROM office_recording_views
       WHERE recording_id = $1
         AND (
           ($2::text IS NOT NULL AND lower(viewer_email) = $2)
           OR ($2::text IS NULL AND $3::text IS NOT NULL AND viewer_key = $3)
         )
         ${body.countView ? 'AND created_at > now() - interval \'30 minutes\'' : ''}
       ORDER BY created_at DESC
       LIMIT 1`,
      [recording.id, viewerEmail, viewerKey]
    )
    if (existingView) {
      await execute(
        `UPDATE office_recording_views
         SET percent_watched = GREATEST(percent_watched, $2),
             watched_seconds = GREATEST(watched_seconds, $3),
             created_at = now()
         WHERE id = $1`,
        [existingView.id, percentWatched, watchedSeconds]
      )
      return { ok: true }
    }
  }

  await execute(
    `INSERT INTO office_recording_views (
       recording_id, viewer_email, viewer_key, percent_watched, watched_seconds
     )
     VALUES ($1, $2, $3, $4, $5)`,
    [recording.id, viewerEmail, viewerKey, percentWatched, watchedSeconds]
  )
  if (body.countView) {
    await execute(
      `UPDATE office_recordings
       SET view_count = view_count + 1
       WHERE id = $1`,
      [recording.id]
    )
  }

  return { ok: true }
})
