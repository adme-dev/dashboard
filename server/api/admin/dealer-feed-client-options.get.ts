import { requireRole } from '~~/server/utils/auth'
import { listDealerFeedClientOptions } from '~~/server/utils/feeds/clientOptions'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])

  return { items: await listDealerFeedClientOptions() }
})
