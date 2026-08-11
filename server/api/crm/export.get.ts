// server/api/crm/export.get.ts
// F9 — export a filtered CRM list (CSV/XLSX). Honours client scope + owner
// visibility, and the same q/filters as the list view.
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { parseFilters } from '~~/server/utils/crm/filters'
import { fetchExportRows, buildExportFile } from '~~/server/utils/crm/exportRecords'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'

const Query = z.object({
  client_id: z.string().uuid(),
  entity: z.enum(['people', 'companies', 'opportunities']),
  format: z.enum(['csv', 'xlsx']).default('csv'),
  q: z.string().optional(),
  filters: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const q = Query.parse(getQuery(event))
  const context = await resolveAgencyCrmSearchContext(event, { clientId: q.client_id, surface: 'agency_global' })
  const rows = await fetchExportRows(q.entity, context, { q: q.q, filters: parseFilters(q.filters) })
  const file = await buildExportFile(q.entity, rows, q.format)
  setHeader(event, 'Content-Type', file.contentType)
  setHeader(event, 'Content-Disposition', `attachment; filename="${file.filename}"`)
  return file.body
})
