import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryRows } from '~~/server/utils/db'
import { portalOverviewRows } from '~~/server/utils/socialListening/portal'
import { buildListeningOverview } from '~~/server/utils/socialListening/analytics'

/** GET /api/client-portal/social/listening/overview — session-scoped analytics. */
export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const days = Number(getQuery(event).days) || 30
  const rows = await portalOverviewRows({ queryRows }, client.clientId, days)
  return buildListeningOverview(rows)
})
