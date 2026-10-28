import { z } from 'zod'
import { queryRowsFresh } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { hasFreshMarketingManagementPermission } from '~~/server/utils/clientScoping'
import { resolveMcpStaffContext } from '~~/server/utils/ai/mcp/staffAuthority'
import { readClientKpiTargets } from '~~/server/utils/clients/kpiTargets'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const marketing = await hasFreshMarketingManagementPermission(user.id)
  if (!marketing) await requireRole(event, PERMISSIONS.CLIENTS)
  const parsed = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Valid client ID required' })
  setResponseHeader(event, 'cache-control', 'private, no-store')
  const fresh = marketing ? await resolveMcpStaffContext(event, user.id, []) : null
  const snapshot = await readClientKpiTargets({ query: async (sql, params) => ({ rows: await queryRowsFresh(sql, params) }) }, parsed.data, marketing)
  return { ...snapshot, canManage: fresh?.permissionGroups?.includes('MARKETING_MANAGEMENT') === true && fresh.assistantReadOnly === false }
})
