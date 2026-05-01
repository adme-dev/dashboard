import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { getAdapter } from '~~/server/utils/leads/destinations'

const Body = z.object({
  destination_type: z.string(),
  config: z.any(),
  filter: z.any().nullable().optional(),
  delay_minutes: z.number().int().min(0).max(1440).default(0),
  enabled: z.boolean().default(true),
  sort_order: z.number().int().default(0),
})

export default defineEventHandler(async (event) => {
  await requireRole(event, ['owner', 'admin'])
  const ruleId = getRouterParam(event, 'ruleId')!
  const b = Body.parse(await readBody(event))
  const adapter = getAdapter(b.destination_type)
  if (!adapter) throw createError({ statusCode: 400, statusMessage: 'unknown_type' })
  const v = adapter.validateConfig(b.config)
  if (!v.valid) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_config', data: v.errors })
  }
  const row = await queryOne<{ id: string }>(
    `INSERT INTO lead_rule_destinations
       (rule_id, destination_type, config, filter, delay_minutes, enabled, sort_order)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7)
     RETURNING id`,
    [
      ruleId, b.destination_type, JSON.stringify(b.config),
      b.filter ? JSON.stringify(b.filter) : null,
      b.delay_minutes, b.enabled, b.sort_order,
    ],
  )
  return { ok: true, id: row!.id }
})
