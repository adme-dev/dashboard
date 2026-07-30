import type { H3Event } from 'h3'
import { z } from 'zod'
import { requireClientCrmAccess } from '~~/server/utils/crm/clientCrmAccess'
import { parseCrmEmailRouteIssuanceConfig } from '~~/server/utils/crm/emailInboundConfig'
import { rotateCrmLeadInboxRoute } from '~~/server/utils/crm/emailRouteManagement'

const Params = z.object({ id: z.string().uuid() }).strict()
const Body = z.object({}).strict()

function stringBinding(event: H3Event, name: string): string | undefined {
  const eventValue = (event.context as {
    cloudflare?: { env?: Record<string, unknown> }
  }).cloudflare?.env?.[name]
  if (typeof eventValue === 'string') return eventValue

  const processValue = process.env[name]
  return typeof processValue === 'string' ? processValue : undefined
}

export default defineEventHandler(async (event) => {
  const client = await requireClientCrmAccess(event, 'admin')
  const params = Params.parse({ id: getRouterParam(event, 'id') })
  Body.parse(await readBody(event))
  const issuance = parseCrmEmailRouteIssuanceConfig({
    secrets: stringBinding(event, 'CRM_EMAIL_REPLY_SECRETS'),
    currentVersion: stringBinding(event, 'CRM_EMAIL_REPLY_CURRENT_VERSION'),
    domain: stringBinding(event, 'CRM_EMAIL_LEAD_ROUTE_DOMAIN')
  })
  const issued = await rotateCrmLeadInboxRoute({
    clientId: client.clientId,
    routeId: params.id,
    actor: { id: client.id, type: 'client_user' },
    issuance
  })
  setResponseHeader(event, 'Cache-Control', 'private, no-store')

  return {
    route: issued.route,
    issuedAddress: issued.issuedAddress,
    addressShownOnce: issued.addressShownOnce
  }
})
