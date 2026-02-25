import { requireRole } from '~~/server/utils/auth'
import { collectAdapterMetrics } from '~~/server/utils/aiLoraManager'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])
  const id = getRouterParam(event, 'id')
  const query = getQuery(event)

  const windowDays = Math.max(parseInt(query.windowDays as string) || 30, 1)

  return collectAdapterMetrics(id!, windowDays)
})
