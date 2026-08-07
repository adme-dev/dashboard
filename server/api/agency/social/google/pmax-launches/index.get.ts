import { z } from 'zod'
import { createError, defineEventHandler, getQuery } from 'h3'
import { hasRole, requirePermission } from '~~/server/utils/auth'
import { listGooglePmaxLaunches } from '~~/server/utils/googlePmaxLaunchStore'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getSelectedTenant } from '~~/server/utils/session'
import { requireAllSocialClientAccess, requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

const QuerySchema = z.strictObject({
  clientId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
})

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'MEDIA_BUYING')
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  const parsed = QuerySchema.safeParse(getQuery(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid launch query' })
  if (parsed.data.clientId) await requireSocialClientAccess(event, parsed.data.clientId)
  else await requireAllSocialClientAccess(event)
  const launches = await listGooglePmaxLaunches({
    tenantId,
    clientId: parsed.data.clientId,
    limit: parsed.data.limit
  })
  return {
    launches,
    permissions: {
      canApprove: hasRole(user, PERMISSIONS.ADMIN)
    }
  }
})
