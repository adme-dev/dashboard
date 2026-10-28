import { z } from 'zod'
import { createError, defineEventHandler, getQuery } from 'h3'
import { hasRole, requirePermission } from '~~/server/utils/auth'
import { queryOneFresh, queryRowsFresh } from '~~/server/utils/db'
import { resolvePmaxDepartmentPortfolio } from '~~/server/utils/googlePmaxDepartmentScope'
import { createGooglePmaxLaunchPreparation, googlePmaxLaunchPreparation } from '~~/server/utils/googlePmaxLaunchPreparation'
import { listGooglePmaxLaunches } from '~~/server/utils/googlePmaxLaunchStore'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getSelectedTenant } from '~~/server/utils/session'
import { requireAllSocialClientAccess, requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

const QuerySchema = z.strictObject({
  clientId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
})

export default defineEventHandler(async (event) => {
  const parsed = QuerySchema.safeParse(getQuery(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid launch query' })
  // Dedicated department staff get a fresh active-client portfolio; they never receive the
  // legacy all-social sentinel, and approval/execution stays on the independent MCP review path.
  const department = await resolvePmaxDepartmentPortfolio(event, parsed.data.clientId)
  const user = department ? null : await requirePermission(event, 'MEDIA_BUYING')
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  if (!department) {
    if (parsed.data.clientId) await requireSocialClientAccess(event, parsed.data.clientId)
    else await requireAllSocialClientAccess(event)
  }
  const scope = department
    ? { tenantId, clientId: parsed.data.clientId, clientIds: department.clientIds, activeClientsOnly: true, limit: parsed.data.limit }
    : { tenantId, clientId: parsed.data.clientId, limit: parsed.data.limit }
  const preparation = department
    ? createGooglePmaxLaunchPreparation({ queryOne: queryOneFresh, queryRows: queryRowsFresh })
    : googlePmaxLaunchPreparation
  const [launches, preparableBriefs] = await Promise.all([
    listGooglePmaxLaunches(scope),
    preparation.list(scope)
  ])
  return {
    launches,
    preparableBriefs,
    permissions: department
      ? { canApprove: false, departmentApprovalChannel: 'mcp' as const }
      : { canApprove: hasRole(user!, PERMISSIONS.ADMIN) }
  }
})
