import { PERMISSIONS } from '~~/server/utils/permissions'
import { execute } from '~~/server/utils/db'
import { resolveMarketingLeadRuleScope } from '~~/server/utils/leads/followupAccess'

export default defineEventHandler(async (event) => {
  const ruleId = getRouterParam(event, 'ruleId')!
  const destId = getRouterParam(event, 'destId')!
  await resolveMarketingLeadRuleScope(event, ruleId, { write: true, legacyRoles: PERMISSIONS.MEDIA_BUYING })
  const n = await execute(`DELETE FROM lead_rule_destinations WHERE id = $1`, [destId])
  if (!n) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  return { ok: true }
})
