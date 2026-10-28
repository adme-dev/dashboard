import { requireDealerFeedAccess } from '~~/server/utils/feeds/departmentAccess'
import { queryRowsFresh } from '~~/server/utils/db'
import { listDealerFeedClientOptions } from '~~/server/utils/feeds/clientOptions'

export default defineEventHandler(async (event) => {
  const { admin } = await requireDealerFeedAccess(event)
  if (admin)
    return {
      items: await listDealerFeedClientOptions({ queryRows: queryRowsFresh })
    }
  // Unmapped ad accounts are not authorized client resources; do not query them for the department.
  const clients = await queryRowsFresh<{ id: string, name: string }>(
    'SELECT id, name FROM agency_clients WHERE is_active = TRUE ORDER BY name'
  )
  return {
    items: clients.map(c => ({
      id: `client:${c.id}`,
      clientId: c.id,
      name: c.name,
      label: c.name,
      source: 'agency',
      isActive: true,
      socialConnectionIds: [],
      socialPlatforms: []
    }))
  }
})
