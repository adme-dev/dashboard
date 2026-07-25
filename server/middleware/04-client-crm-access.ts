import { requireClientCrmAccess, resolveClientCrmAccessLevel } from '~~/server/utils/crm/clientCrmAccess'

const CRM_API_PREFIX = '/api/client-portal/crm'

export default defineEventHandler(async (event) => {
  const { pathname } = getRequestURL(event)
  if (pathname !== CRM_API_PREFIX && !pathname.startsWith(`${CRM_API_PREFIX}/`)) return

  await requireClientCrmAccess(
    event,
    resolveClientCrmAccessLevel(pathname, event.method)
  )
})
