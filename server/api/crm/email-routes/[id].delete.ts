import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { revokeCrmLeadInboxRoute } from '~~/server/utils/crm/emailRouteManagement'
import { PERMISSIONS } from '~~/server/utils/permissions'

const Params = z.object({ id: z.string().uuid() }).strict()
const Body = z.object({ client_id: z.string().uuid() }).strict()

export default defineEventHandler(async (event) => {
  if ((event.context as { clientPortalUser?: unknown }).clientPortalUser) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  const actor = await requireRole(event, PERMISSIONS.CLIENTS)
  const params = Params.parse({ id: getRouterParam(event, 'id') })
  const body = Body.parse(await readBody(event))
  const result = await revokeCrmLeadInboxRoute({
    clientId: body.client_id,
    routeId: params.id,
    actor: { id: actor.id, type: 'team_member' }
  })

  return { route: result.route }
})
