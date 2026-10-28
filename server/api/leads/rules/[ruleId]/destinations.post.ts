import { z } from 'zod'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { resolveMarketingLeadRuleScope } from '~~/server/utils/leads/followupAccess'
import { validateLeadRuleDestination } from '~~/server/utils/leads/ruleConfiguration'

const Body = z.object({
  destination_type: z.string(),
  config: z.any(),
  filter: z.any().nullable().optional(),
  delay_minutes: z.number().int().min(0).max(1440).default(0),
  enabled: z.boolean().default(true),
  sort_order: z.number().int().default(0)
})

export default defineEventHandler(async (event) => {
  const ruleId = getRouterParam(event, 'ruleId')!
  await resolveMarketingLeadRuleScope(event, ruleId, { write: true, legacyRoles: PERMISSIONS.MEDIA_BUYING })
  const b = Body.parse(await readBody(event))
  validateLeadRuleDestination(b.destination_type, b.config)
  const row = await queryOne<{ id: string }>(
    `INSERT INTO lead_rule_destinations
       (rule_id, destination_type, config, filter, delay_minutes, enabled, sort_order)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7)
     RETURNING id`,
    [
      ruleId, b.destination_type, JSON.stringify(b.config),
      b.filter ? JSON.stringify(b.filter) : null,
      b.delay_minutes, b.enabled, b.sort_order
    ]
  )
  return { ok: true, id: row!.id }
})
