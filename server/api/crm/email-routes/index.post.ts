import type { H3Event } from 'h3'
import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { parseCrmEmailRouteIssuanceConfig } from '~~/server/utils/crm/emailInboundConfig'
import { createCrmLeadInboxRoute } from '~~/server/utils/crm/emailRouteManagement'
import { PERMISSIONS } from '~~/server/utils/permissions'

const Body = z.object({
  client_id: z.string().uuid(),
  label: z.string().trim().min(1).max(128).default('CRM inbox')
}).strict()

function stringBinding(event: H3Event, name: string): string | undefined {
  const eventValue = (event.context as {
    cloudflare?: { env?: Record<string, unknown> }
  }).cloudflare?.env?.[name]
  if (typeof eventValue === 'string') return eventValue

  const processValue = process.env[name]
  return typeof processValue === 'string' ? processValue : undefined
}

export default defineEventHandler(async (event) => {
  if ((event.context as { clientPortalUser?: unknown }).clientPortalUser) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  const actor = await requireRole(event, PERMISSIONS.CLIENTS)
  const body = Body.parse(await readBody(event))
  const issuance = parseCrmEmailRouteIssuanceConfig({
    secrets: stringBinding(event, 'CRM_EMAIL_REPLY_SECRETS'),
    currentVersion: stringBinding(event, 'CRM_EMAIL_REPLY_CURRENT_VERSION'),
    domain: stringBinding(event, 'CRM_EMAIL_LEAD_ROUTE_DOMAIN')
  })
  const issued = await createCrmLeadInboxRoute({
    clientId: body.client_id,
    label: body.label,
    actor: { id: actor.id, type: 'team_member' },
    issuance
  })
  setResponseHeader(event, 'Cache-Control', 'private, no-store')

  return {
    route: issued.route,
    issuedAddress: issued.issuedAddress,
    addressShownOnce: issued.addressShownOnce
  }
})
