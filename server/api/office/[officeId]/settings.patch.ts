/**
 * PATCH /api/office/:officeId/settings
 * Admin-only office policy updates.
 */
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { ensureOfficeSettingsTable } from '~~/server/utils/officeSettings'
import { logOfficeAuditEvent } from '~~/server/utils/officeAudit'
import { canAdministerOffice } from '~~/server/utils/officeRoom'
import type { OfficeMemberRow, OfficeSettingsRow } from '~~/app/types/office'

const Body = z.object({
  guest_access_enabled: z.boolean().optional(),
  public_lobbies_enabled: z.boolean().optional(),
  recording_enabled: z.boolean().optional(),
  public_recording_links_enabled: z.boolean().optional(),
  ai_notes_enabled: z.boolean().optional(),
  assistant_enabled: z.boolean().optional(),
  default_meeting_retention_days: z.number().int().min(1).max(3650).optional(),
  default_recording_retention_days: z.number().int().min(1).max(3650).optional(),
  require_recording_consent: z.boolean().optional()
})

const UPDATABLE_KEYS = [
  'guest_access_enabled',
  'public_lobbies_enabled',
  'recording_enabled',
  'public_recording_links_enabled',
  'ai_notes_enabled',
  'assistant_enabled',
  'default_meeting_retention_days',
  'default_recording_retention_days',
  'require_recording_consent'
] as const

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
  if (!canAdministerOffice(user, membership)) {
    throw createError({ statusCode: 403, statusMessage: 'Admin access required' })
  }

  await ensureOfficeSettingsTable()
  const body = Body.parse(await readBody(event))
  const sets: string[] = []
  const params: unknown[] = [officeId, user.id]
  for (const key of UPDATABLE_KEYS) {
    if (body[key] === undefined) continue
    params.push(body[key])
    sets.push(`${key} = $${params.length}`)
  }

  if (sets.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No settings provided' })
  }

  const settings = await queryOne<OfficeSettingsRow>(
    `INSERT INTO office_settings (office_id, updated_by)
     VALUES ($1, $2)
     ON CONFLICT (office_id) DO UPDATE
       SET ${sets.join(', ')},
           updated_by = $2,
           updated_at = now()
     RETURNING *`,
    params
  )

  await logOfficeAuditEvent({
    officeId,
    actorId: user.id,
    action: 'settings.updated',
    targetType: 'office_settings',
    targetId: null,
    metadata: { changed: body }
  })

  return { settings }
})
