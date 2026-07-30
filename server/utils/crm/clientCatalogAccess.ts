import type { H3Event } from 'h3'
import { createError } from 'h3'
import { requireClientAuth } from '~~/server/utils/clientAuth'

export async function requireClientCatalogAccess(event: H3Event, manage = false) {
  const client = await requireClientAuth(event)
  if (client.leadCaptureMode !== 'full_crm') {
    throw createError({ statusCode: 403, statusMessage: 'Full CRM is not enabled for this client' })
  }
  if (manage && !client.isPrimaryContact && !client.permissions.canAdminCrm) {
    throw createError({ statusCode: 403, statusMessage: 'Client administrator access is required' })
  }
  return client
}
