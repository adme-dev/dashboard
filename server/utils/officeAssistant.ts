import { execute } from '~~/server/utils/db'
import type { OfficeAssistantWatchRow } from '~~/app/types/office'

let ensurePromise: Promise<void> | null = null

export interface OfficeAssistantWatchFactState {
  userStatuses?: Record<string, string | null | undefined>
  pendingLobbyGuests?: number
  endedMeetingIds?: string[]
  occupiedZoneIds?: string[]
  coPresenceUserIds?: string[]
}

export interface OfficeAssistantWatchTrigger {
  title: string
  message: string
  metadata: Record<string, unknown>
}

type EvaluatableWatch = Pick<OfficeAssistantWatchRow, 'id' | 'watch_type' | 'label' | 'conditions'>

function getStringCondition(conditions: Record<string, unknown>, key: string) {
  const value = conditions[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getStringArrayCondition(conditions: Record<string, unknown>, key: string) {
  const value = conditions[key]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

export function evaluateOfficeAssistantWatch(
  watch: EvaluatableWatch,
  facts: OfficeAssistantWatchFactState
): OfficeAssistantWatchTrigger | null {
  const baseMetadata = {
    source: 'office_assistant',
    watchId: watch.id,
    watchType: watch.watch_type
  }

  if (watch.watch_type === 'person_available') {
    const userId = getStringCondition(watch.conditions, 'userId')
    if (!userId) return null

    const status = facts.userStatuses?.[userId]
    if (status !== 'online' && status !== 'available') return null

    return {
      title: 'Office assistant',
      message: watch.label,
      metadata: { ...baseMetadata, userId, status }
    }
  }

  if (watch.watch_type === 'lobby_guest_waiting') {
    const pendingLobbyGuests = facts.pendingLobbyGuests ?? 0
    if (pendingLobbyGuests <= 0) return null

    return {
      title: 'Guest waiting in lobby',
      message: watch.label,
      metadata: { ...baseMetadata, pendingLobbyGuests }
    }
  }

  if (watch.watch_type === 'meeting_ended') {
    const meetingId = getStringCondition(watch.conditions, 'meetingId')
    const endedMeetingIds = facts.endedMeetingIds ?? []
    const triggeredMeetingId = meetingId
      ? endedMeetingIds.find(id => id === meetingId)
      : endedMeetingIds[0]
    if (!triggeredMeetingId) return null

    return {
      title: 'Meeting ended',
      message: watch.label,
      metadata: { ...baseMetadata, meetingId: triggeredMeetingId }
    }
  }

  if (watch.watch_type === 'room_occupied') {
    const zoneId = getStringCondition(watch.conditions, 'zoneId')
    if (!zoneId || !facts.occupiedZoneIds?.includes(zoneId)) return null

    return {
      title: 'Room is occupied',
      message: watch.label,
      metadata: { ...baseMetadata, zoneId }
    }
  }

  if (watch.watch_type === 'co_presence') {
    const userIds = getStringArrayCondition(watch.conditions, 'userIds')
    if (userIds.length < 2) return null

    const presentUserIds = new Set(facts.coPresenceUserIds ?? [])
    if (!userIds.every(userId => presentUserIds.has(userId))) return null

    return {
      title: 'People are together',
      message: watch.label,
      metadata: { ...baseMetadata, userIds }
    }
  }

  return null
}

export function ensureOfficeAssistantTables() {
  ensurePromise ??= ensureOfficeAssistantTablesOnce().catch((error) => {
    ensurePromise = null
    throw error
  })

  return ensurePromise
}

async function ensureOfficeAssistantTablesOnce() {
  await execute(`
    CREATE TABLE IF NOT EXISTS office_assistant_watches (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      office_id         uuid NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
      user_id           uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
      watch_type        text NOT NULL
                        CHECK (watch_type IN ('person_available','room_occupied','co_presence','meeting_ended','lobby_guest_waiting')),
      status            text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','paused','triggered','cancelled')),
      label             text NOT NULL,
      conditions        jsonb NOT NULL DEFAULT '{}'::jsonb,
      delivery          jsonb NOT NULL DEFAULT '{"notification": true}'::jsonb,
      last_triggered_at timestamptz,
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now()
    )
  `)
  await execute(`
    ALTER TABLE office_assistant_watches
      ADD COLUMN IF NOT EXISTS conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS delivery jsonb NOT NULL DEFAULT '{"notification": true}'::jsonb,
      ADD COLUMN IF NOT EXISTS last_triggered_at timestamptz,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
  `)
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_office_assistant_watches_office_user
      ON office_assistant_watches(office_id, user_id, status, created_at DESC)
  `)
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_office_assistant_watches_type
      ON office_assistant_watches(office_id, watch_type, status)
  `)
  await execute(`
    CREATE TABLE IF NOT EXISTS office_assistant_jobs (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      office_id         uuid NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
      watch_id          uuid REFERENCES office_assistant_watches(id) ON DELETE SET NULL,
      user_id           uuid REFERENCES team_members(id) ON DELETE SET NULL,
      job_type          text NOT NULL
                        CHECK (job_type IN ('notify','schedule_meeting','send_follow_up','summarize_thread','collect_status')),
      status            text NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued','running','waiting_approval','completed','failed','cancelled')),
      title             text NOT NULL,
      input             jsonb NOT NULL DEFAULT '{}'::jsonb,
      result            jsonb NOT NULL DEFAULT '{}'::jsonb,
      approval_required boolean NOT NULL DEFAULT false,
      approved_by       uuid REFERENCES team_members(id) ON DELETE SET NULL,
      approved_at       timestamptz,
      started_at        timestamptz,
      completed_at      timestamptz,
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now()
    )
  `)
  await execute(`
    ALTER TABLE office_assistant_jobs
      ADD COLUMN IF NOT EXISTS input jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS result jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS approval_required boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES team_members(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS approved_at timestamptz,
      ADD COLUMN IF NOT EXISTS started_at timestamptz,
      ADD COLUMN IF NOT EXISTS completed_at timestamptz,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
  `)
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_office_assistant_jobs_office
      ON office_assistant_jobs(office_id, status, created_at DESC)
  `)
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_office_assistant_jobs_watch
      ON office_assistant_jobs(watch_id, created_at DESC)
      WHERE watch_id IS NOT NULL
  `)
}
