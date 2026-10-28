import { z } from 'zod'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { execute } from '~~/server/utils/db'
import { resolveMarketingLeadRuleScope } from '~~/server/utils/leads/followupAccess'

const Body = z.object({
  enabled: z.boolean().optional(),
  form_name: z.string().optional()
})

export default defineEventHandler(async (event) => {
  const ruleId = getRouterParam(event, 'ruleId')!
  await resolveMarketingLeadRuleScope(event, ruleId, { write: true, legacyRoles: PERMISSIONS.MEDIA_BUYING })
  const b = Body.parse(await readBody(event))
  const sets: string[] = []
  const params: unknown[] = []
  if ('enabled' in b) {
    params.push(b.enabled)
    sets.push(`enabled = $${params.length}`)
  }
  if ('form_name' in b) {
    params.push(b.form_name)
    sets.push(`form_name = $${params.length}`)
  }
  if (!sets.length) return { ok: true }
  params.push(ruleId)
  await execute(
    `UPDATE lead_form_rules SET ${sets.join(', ')}, updated_at = NOW()
     WHERE id = $${params.length}`,
    params
  )
  return { ok: true }
})
