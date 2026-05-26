import { createNotification } from '~~/server/utils/notifications'
import { queryOne, queryRows } from '~~/server/utils/db'
import {
  ensureOfficeAssistantTables,
  evaluateOfficeAssistantWatch,
  type OfficeAssistantWatchFactState
} from '~~/server/utils/officeAssistant'
import { ensureOfficeLobbyRequestsTable } from '~~/server/utils/officeLobbyRequests'
import { ensureOfficeMeetingArtifactsTables } from '~~/server/utils/officeMeetingArtifacts'
import { ensureOfficePresenceLocationsTable } from '~~/server/utils/officePresenceLocations'
import { getOfficeSettings } from '~~/server/utils/officeSettings'
import type { OfficeAssistantJobRow, OfficeAssistantWatchRow } from '~~/app/types/office'

type WatchCandidate = OfficeAssistantWatchRow & {
  conditions: Record<string, unknown> | string
  delivery: OfficeAssistantWatchRow['delivery'] | string
}

interface StatusRow {
  user_id: string
  status: string | null
}

interface CountRow {
  count: string | number
}

interface MeetingFactRow {
  id: string
}

interface LocationFactRow {
  zone_id: string
  actor_type: 'user' | 'client'
  actor_id: string
}

export interface EvaluateOfficeAssistantWatchesOptions {
  officeId: string
  userId?: string
  limit?: number
}

export interface EvaluateOfficeAssistantWatchesResult {
  evaluated: number
  triggered: OfficeAssistantJobRow[]
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function getWatchedUserIds(watches: Array<Pick<OfficeAssistantWatchRow, 'watch_type' | 'conditions'>>) {
  const userIds = new Set<string>()
  for (const watch of watches) {
    if (watch.watch_type === 'person_available' && typeof watch.conditions.userId === 'string') {
      userIds.add(watch.conditions.userId)
    }
    if (watch.watch_type === 'co_presence' && Array.isArray(watch.conditions.userIds)) {
      for (const userId of watch.conditions.userIds) {
        if (typeof userId === 'string') userIds.add(userId)
      }
    }
  }
  return [...userIds]
}

export async function ensureOfficeAssistantEvaluatorTables() {
  await ensureOfficeAssistantTables()
  await ensureOfficeLobbyRequestsTable()
  await ensureOfficeMeetingArtifactsTables()
  await ensureOfficePresenceLocationsTable()
}

export async function evaluateOfficeAssistantWatches(
  options: EvaluateOfficeAssistantWatchesOptions
): Promise<EvaluateOfficeAssistantWatchesResult> {
  await ensureOfficeAssistantEvaluatorTables()
  const settings = await getOfficeSettings(options.officeId)
  if (!settings?.assistant_enabled) {
    return { evaluated: 0, triggered: [] }
  }

  const limit = Math.min(Math.max(options.limit ?? 50, 1), 250)
  const userFilter = options.userId ? 'AND user_id = $2' : ''
  const limitParamIndex = options.userId ? 3 : 2
  const params = options.userId
    ? [options.officeId, options.userId, limit]
    : [options.officeId, limit]

  const rawWatches = await queryRows<WatchCandidate>(
    `SELECT *
     FROM office_assistant_watches
     WHERE office_id = $1
       ${userFilter}
       AND status = 'active'
       AND (
         last_triggered_at IS NULL
         OR last_triggered_at < now() - interval '15 minutes'
       )
     ORDER BY created_at ASC
     LIMIT $${limitParamIndex}`,
    params
  )

  const watches = rawWatches.map(watch => ({
    ...watch,
    conditions: parseJsonRecord(watch.conditions),
    delivery: parseJsonRecord(watch.delivery) as OfficeAssistantWatchRow['delivery']
  }))
  const watchedUserIds = getWatchedUserIds(watches)

  const statusRows = watchedUserIds.length
    ? await queryRows<StatusRow>(
        `SELECT user_id::text, status
         FROM user_chat_status
         WHERE user_id = ANY($1::uuid[])`,
        [watchedUserIds]
      )
    : []
  const userStatuses = Object.fromEntries(statusRows.map(row => [row.user_id, row.status]))

  const pendingLobbyRow = await queryOne<CountRow>(
    `SELECT COUNT(*)::int AS count
     FROM office_lobby_requests
     WHERE office_id = $1
       AND status = 'pending'
       AND created_at >= now() - interval '30 minutes'`,
    [options.officeId]
  )

  const endedMeetings = await queryRows<MeetingFactRow>(
    `SELECT id::text
     FROM office_meeting_sessions
     WHERE office_id = $1
       AND status = 'ended'
       AND COALESCE(ended_at, updated_at) >= now() - interval '15 minutes'`,
    [options.officeId]
  )

  const liveLocations = await queryRows<LocationFactRow>(
    `SELECT zone_id::text, actor_type, actor_id::text
     FROM office_presence_locations
     WHERE office_id = $1
       AND presence = 'online'
       AND zone_id IS NOT NULL
       AND last_seen_at >= now() - interval '2 minutes'`,
    [options.officeId]
  )

  const facts: OfficeAssistantWatchFactState = {
    userStatuses,
    pendingLobbyGuests: Number(pendingLobbyRow?.count ?? 0),
    endedMeetingIds: endedMeetings.map(meeting => meeting.id),
    occupiedZoneIds: [...new Set(liveLocations.map(location => location.zone_id))],
    coPresenceUserIds: [...new Set(liveLocations
      .filter(location => location.actor_type === 'user')
      .map(location => location.actor_id))]
  }

  const triggered: OfficeAssistantJobRow[] = []
  for (const watch of watches) {
    const trigger = evaluateOfficeAssistantWatch(watch, facts)
    if (!trigger) continue

    const job = await queryOne<OfficeAssistantJobRow>(
      `INSERT INTO office_assistant_jobs (
         office_id, watch_id, user_id, job_type, status, title, input, result,
         started_at, completed_at
       )
       VALUES ($1, $2, $3, 'notify', 'completed', $4, $5, $6, now(), now())
       RETURNING *`,
      [
        options.officeId,
        watch.id,
        watch.user_id,
        trigger.title,
        JSON.stringify({ watchId: watch.id, watchType: watch.watch_type, conditions: watch.conditions }),
        JSON.stringify({ triggered: true, ...trigger.metadata })
      ]
    )
    if (!job) continue

    await queryOne(
      `UPDATE office_assistant_watches
       SET last_triggered_at = now()
       WHERE id = $1
       RETURNING id`,
      [watch.id]
    )

    if (watch.delivery.notification !== false) {
      await createNotification({
        userId: watch.user_id,
        type: 'system',
        title: trigger.title,
        message: trigger.message,
        link: '/office',
        metadata: { ...trigger.metadata, jobId: job.id },
        reason: 'direct'
      })
    }

    triggered.push(job)
  }

  return {
    evaluated: watches.length,
    triggered
  }
}
