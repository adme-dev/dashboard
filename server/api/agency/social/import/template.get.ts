/**
 * GET /api/agency/social/import/template
 * Returns a CSV template file for spend data import.
 */
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const headers = 'date,campaign_name,spend,impressions,clicks,conversions'
  const sample = '2024-03-01,My Campaign,1500.00,50000,2500,125'
  const csv = `${headers}\n${sample}\n`

  setResponseHeader(event, 'Content-Type', 'text/csv')
  setResponseHeader(event, 'Content-Disposition', 'attachment; filename="spend-import-template.csv"')

  return csv
})
