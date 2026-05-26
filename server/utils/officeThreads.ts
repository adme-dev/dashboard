import { execute, queryOne, queryRows } from '~~/server/utils/db'
import type { OfficeGuestBadgeRow, OfficeMeetingSessionRow, OfficeMemberRow, OfficeRecordingRow, OfficeZoneRow } from '~~/app/types/office'

let ensurePromise: Promise<void> | null = null

type MeetingThreadRow = Pick<OfficeMeetingSessionRow, 'id' | 'office_id' | 'title' | 'status'>
type RecordingThreadRow = Pick<OfficeRecordingRow, 'id' | 'office_id' | 'title' | 'status'>
type ZoneThreadRow = Pick<OfficeZoneRow, 'id' | 'office_id' | 'slug' | 'name' | 'zone_type'>
type GuestThreadRow = Pick<OfficeGuestBadgeRow, 'id' | 'office_id' | 'guest_name' | 'guest_email' | 'status'>

export function ensureOfficeThreadChannelTypes() {
  ensurePromise ??= ensureOfficeThreadChannelTypesOnce().catch((error) => {
    ensurePromise = null
    throw error
  })

  return ensurePromise
}

async function ensureOfficeThreadChannelTypesOnce() {
  await execute(`
    ALTER TABLE chat_channels DROP CONSTRAINT IF EXISTS chat_channels_type_check
  `)
  await execute(`
    ALTER TABLE chat_channels ADD CONSTRAINT chat_channels_type_check
      CHECK (type IN ('channel','dm','group_dm','office_zone','office_meeting','office_recording','office_guest'))
  `)
  await execute(`
    ALTER TABLE chat_channels ADD COLUMN IF NOT EXISTS external_id uuid
  `)
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_chat_channels_external
      ON chat_channels(type, external_id) WHERE external_id IS NOT NULL
  `)
}

function meetingThreadSlug(meetingId: string) {
  return `office-meeting-${meetingId}`
}

function recordingThreadSlug(recordingId: string) {
  return `office-recording-${recordingId}`
}

function guestThreadSlug(badgeId: string) {
  return `office-guest-${badgeId}`
}

function zoneThreadSlug(zoneId: string) {
  return `office-zone-${zoneId}`
}

async function enrollOfficeMembers(channelId: string, officeId: string) {
  const members = await queryRows<Pick<OfficeMemberRow, 'user_id' | 'role'>>(
    `SELECT user_id, role
     FROM office_members
     WHERE office_id = $1 AND user_id IS NOT NULL`,
    [officeId]
  )

  for (const member of members) {
    if (!member.user_id) continue
    await execute(`
      INSERT INTO chat_channel_members (channel_id, user_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (channel_id, user_id) DO NOTHING
    `, [
      channelId,
      member.user_id,
      member.role === 'admin' ? 'admin' : 'member'
    ])
  }
}

export async function ensureOfficeZoneThreadChannel(input: {
  officeId: string
  zoneId: string
  actorId: string
}) {
  await ensureOfficeThreadChannelTypes()

  const zone = await queryOne<ZoneThreadRow>(
    `SELECT id, office_id, slug, name, zone_type
     FROM office_zones
     WHERE id = $1
       AND office_id = $2`,
    [input.zoneId, input.officeId]
  )
  if (!zone) return null
  if (zone.zone_type === 'desk') return null

  const canonicalSlug = zoneThreadSlug(zone.id)
  const legacySlugs = [`office-${zone.slug}`, `office-room-${zone.id}`]
  let channel = await queryOne(`
    SELECT *
    FROM chat_channels
    WHERE archived_at IS NULL
      AND (
        (type = 'office_zone' AND external_id = $1)
        OR slug = ANY($2::text[])
      )
    ORDER BY
      CASE WHEN type = 'office_zone' AND external_id = $1 THEN 0 ELSE 1 END,
      created_at ASC
    LIMIT 1
  `, [zone.id, legacySlugs])

  if (!channel) {
    channel = await queryOne(`
      INSERT INTO chat_channels (name, slug, description, type, is_private, external_id, created_by)
      VALUES ($1, $2, $3, 'office_zone', true, $4, $5)
      RETURNING *
    `, [
      zone.name,
      canonicalSlug,
      `Persistent room thread for ${zone.name}`,
      zone.id,
      input.actorId
    ])
  } else {
    channel = await queryOne(`
      UPDATE chat_channels
      SET
        name = $2,
        description = COALESCE(description, $3),
        type = 'office_zone',
        is_private = true,
        external_id = $1,
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [
      zone.id,
      zone.name,
      `Persistent room thread for ${zone.name}`,
      channel.id
    ])
  }

  await enrollOfficeMembers(channel.id, input.officeId)

  return channel
}

export async function ensureOfficeMeetingThreadChannel(input: {
  officeId: string
  meetingId: string
  actorId: string
}) {
  await ensureOfficeThreadChannelTypes()

  const meeting = await queryOne<MeetingThreadRow>(
    `SELECT id, office_id, title, status
     FROM office_meeting_sessions
     WHERE id = $1
       AND office_id = $2`,
    [input.meetingId, input.officeId]
  )
  if (!meeting) return null

  const canonicalSlug = meetingThreadSlug(meeting.id)
  let channel = await queryOne(`
    SELECT *
    FROM chat_channels
    WHERE archived_at IS NULL
      AND (
        (type = 'office_meeting' AND external_id = $1)
        OR slug = $2
      )
    ORDER BY
      CASE WHEN type = 'office_meeting' AND external_id = $1 THEN 0 ELSE 1 END,
      created_at ASC
    LIMIT 1
  `, [meeting.id, canonicalSlug])

  if (!channel) {
    channel = await queryOne(`
      INSERT INTO chat_channels (name, slug, description, type, is_private, external_id, created_by)
      VALUES ($1, $2, $3, 'office_meeting', true, $4, $5)
      RETURNING *
    `, [
      meeting.title,
      canonicalSlug,
      `Persistent meeting thread for ${meeting.title}`,
      meeting.id,
      input.actorId
    ])
  } else {
    channel = await queryOne(`
      UPDATE chat_channels
      SET
        name = $2,
        description = COALESCE(description, $3),
        type = 'office_meeting',
        is_private = true,
        external_id = $1,
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [
      meeting.id,
      meeting.title,
      `Persistent meeting thread for ${meeting.title}`,
      channel.id
    ])
  }

  await enrollOfficeMembers(channel.id, input.officeId)

  return channel
}

export async function ensureOfficeRecordingThreadChannel(input: {
  officeId: string
  recordingId: string
  actorId: string
}) {
  await ensureOfficeThreadChannelTypes()

  const recording = await queryOne<RecordingThreadRow>(
    `SELECT id, office_id, title, status
     FROM office_recordings
     WHERE id = $1
       AND office_id = $2`,
    [input.recordingId, input.officeId]
  )
  if (!recording) return null

  const canonicalSlug = recordingThreadSlug(recording.id)
  let channel = await queryOne(`
    SELECT *
    FROM chat_channels
    WHERE archived_at IS NULL
      AND (
        (type = 'office_recording' AND external_id = $1)
        OR slug = $2
      )
    ORDER BY
      CASE WHEN type = 'office_recording' AND external_id = $1 THEN 0 ELSE 1 END,
      created_at ASC
    LIMIT 1
  `, [recording.id, canonicalSlug])

  if (!channel) {
    channel = await queryOne(`
      INSERT INTO chat_channels (name, slug, description, type, is_private, external_id, created_by)
      VALUES ($1, $2, $3, 'office_recording', true, $4, $5)
      RETURNING *
    `, [
      recording.title,
      canonicalSlug,
      `Persistent recording thread for ${recording.title}`,
      recording.id,
      input.actorId
    ])
  } else {
    channel = await queryOne(`
      UPDATE chat_channels
      SET
        name = $2,
        description = COALESCE(description, $3),
        type = 'office_recording',
        is_private = true,
        external_id = $1,
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [
      recording.id,
      recording.title,
      `Persistent recording thread for ${recording.title}`,
      channel.id
    ])
  }

  await enrollOfficeMembers(channel.id, input.officeId)

  return channel
}

export async function ensureOfficeGuestThreadChannel(input: {
  officeId: string
  badgeId: string
  actorId: string
}) {
  await ensureOfficeThreadChannelTypes()

  const badge = await queryOne<GuestThreadRow>(
    `SELECT id, office_id, guest_name, guest_email, status
     FROM office_guest_badges
     WHERE id = $1
       AND office_id = $2`,
    [input.badgeId, input.officeId]
  )
  if (!badge) return null

  const canonicalSlug = guestThreadSlug(badge.id)
  let channel = await queryOne(`
    SELECT *
    FROM chat_channels
    WHERE archived_at IS NULL
      AND (
        (type = 'office_guest' AND external_id = $1)
        OR slug = $2
      )
    ORDER BY
      CASE WHEN type = 'office_guest' AND external_id = $1 THEN 0 ELSE 1 END,
      created_at ASC
    LIMIT 1
  `, [badge.id, canonicalSlug])

  const channelName = `${badge.guest_name} guest pass`
  const description = `Guest access thread for ${badge.guest_name} <${badge.guest_email}>`
  if (!channel) {
    channel = await queryOne(`
      INSERT INTO chat_channels (name, slug, description, type, is_private, external_id, created_by)
      VALUES ($1, $2, $3, 'office_guest', true, $4, $5)
      RETURNING *
    `, [
      channelName,
      canonicalSlug,
      description,
      badge.id,
      input.actorId
    ])
  } else {
    channel = await queryOne(`
      UPDATE chat_channels
      SET
        name = $2,
        description = COALESCE(description, $3),
        type = 'office_guest',
        is_private = true,
        external_id = $1,
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [
      badge.id,
      channelName,
      description,
      channel.id
    ])
  }

  await enrollOfficeMembers(channel.id, input.officeId)

  return channel
}
