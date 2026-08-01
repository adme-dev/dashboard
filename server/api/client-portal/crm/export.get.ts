// server/api/client-portal/crm/export.get.ts — session-scoped export.
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { parseFilters } from '~~/server/utils/crm/filters'
import { fetchExportRows, buildExportFile } from '~~/server/utils/crm/exportRecords'

const Query = z.object({
  entity: z.enum(['people', 'companies', 'opportunities']),
  format: z.enum(['csv', 'xlsx']).default('csv'),
  q: z.string().optional(),
  filters: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const q = Query.parse(getQuery(event))
  const rows = await fetchExportRows(q.entity, client.clientId, { q: q.q, filters: parseFilters(q.filters) })
  const file = await buildExportFile(q.entity, rows, q.format)
  setHeader(event, 'Content-Type', file.contentType)
  setHeader(event, 'Content-Disposition', `attachment; filename="${file.filename}"`)
  return file.body
})
