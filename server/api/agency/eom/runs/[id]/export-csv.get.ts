/**
 * GET /api/agency/eom/runs/:id/export-csv
 * Export EOM run as Xero-compatible CSV
 */

import { createError, getRouterParam, setResponseHeader } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { generateXeroCSV } from '~~/server/utils/eomCsvExport'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Run ID is required' })
  }

  // Get run info for filename
  const run = await queryOne<{ month: number; year: number }>(
    `SELECT month, year FROM eom_runs WHERE id = $1`,
    [id],
  )

  if (!run) {
    throw createError({ statusCode: 404, statusMessage: 'EOM run not found' })
  }

  try {
    const csv = await generateXeroCSV(id)
    const monthStr = String(run.month).padStart(2, '0')
    const filename = `ADME-invoices-${run.year}-${monthStr}.csv`

    setResponseHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
    setResponseHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)

    return csv
  } catch (err: any) {
    console.error('[EOM] CSV export failed:', err)
    throw createError({
      statusCode: 500,
      statusMessage: `CSV export failed: ${err.message}`,
    })
  }
})
