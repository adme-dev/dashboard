import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { execute } from '~~/server/utils/db'
import { getAdapter } from '~~/server/utils/leads/destinations'

const Body = z.object({
  destination_type: z.string(),
  config: z.any(),
  filter: z.any().nullable().optional(),
  delay_minutes: z.number().int().min(0).max(1440),
  enabled: z.boolean(),
  sort_order: z.number().int(),
})

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.MEDIA_BUYING)
  const destId = getRouterParam(event, 'destId')!
  const b = Body.parse(await readBody(event))
  const adapter = getAdapter(b.destination_type)
  if (!adapter) throw createError({ statusCode: 400, statusMessage: 'unknown_type' })
  const v = adapter.validateConfig(b.config)
  if (!v.valid) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_config', data: v.errors })
  }
  await execute(
    `UPDATE lead_rule_destinations
     SET destination_type = $2, config = $3::jsonb, filter = $4::jsonb,
         delay_minutes = $5, enabled = $6, sort_order = $7, updated_at = NOW()
     WHERE id = $1`,
    [
      destId, b.destination_type, JSON.stringify(b.config),
      b.filter ? JSON.stringify(b.filter) : null,
      b.delay_minutes, b.enabled, b.sort_order,
    ],
  )
  return { ok: true }
})
