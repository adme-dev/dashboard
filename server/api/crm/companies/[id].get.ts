// server/api/crm/companies/[id].get.ts
import { z } from 'zod'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'
import { requireCrmRecordAccess } from '~~/server/utils/crm/recordAccess'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const { client_id } = Query.parse(getQuery(event))
  const context = await resolveAgencyCrmSearchContext(event, { clientId: client_id, surface: 'agency_global' })
  const record = await requireCrmRecordAccess(context, { type: 'company', id: id as string })
  return { item: record.row }
})
