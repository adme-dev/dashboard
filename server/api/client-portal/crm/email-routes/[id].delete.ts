import { z } from 'zod'
import { requireClientCrmAccess } from '~~/server/utils/crm/clientCrmAccess'
import { revokeCrmLeadInboxRoute } from '~~/server/utils/crm/emailRouteManagement'

const Params = z.object({ id: z.string().uuid() }).strict()
const Body = z.object({}).strict().optional()

export default defineEventHandler(async (event) => {
  const client = await requireClientCrmAccess(event, 'admin')
  const params = Params.parse({ id: getRouterParam(event, 'id') })
  Body.parse(await readBody(event))
  const result = await revokeCrmLeadInboxRoute({
    clientId: client.clientId,
    routeId: params.id,
    actor: { id: client.id, type: 'client_user' }
  })
  setResponseHeader(event, 'Cache-Control', 'private, no-store')

  return { route: result.route }
})
