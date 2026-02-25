/**
 * POST /api/agency/eom/runs/:id/archive
 * Archive CSV to R2 storage and mark run as complete.
 * Requires run to be in 'pushed' status.
 */

import { createError, getRouterParam } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'
import { generateXeroCSV } from '~~/server/utils/eomCsvExport'

export default eventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])
  const runId = getRouterParam(event, 'id')

  if (!runId) {
    throw createError({ statusCode: 400, statusMessage: 'Run ID is required' })
  }

  const run = await queryOne<{ id: string; status: string; month: number; year: number }>(
    `SELECT id, status, month, year FROM eom_runs WHERE id = $1`,
    [runId],
  )

  if (!run) {
    throw createError({ statusCode: 404, statusMessage: 'EOM run not found' })
  }

  if (run.status !== 'pushed') {
    throw createError({ statusCode: 400, statusMessage: 'Can only archive pushed runs' })
  }

  // Generate CSV
  const csv = await generateXeroCSV(runId)

  // Upload to R2 if configured
  const config = useRuntimeConfig()
  let archiveUrl: string | null = null

  if (config.r2AccountId && config.r2AccessKeyId && config.r2SecretAccessKey) {
    const fileName = `eom/${run.year}/${String(run.month).padStart(2, '0')}/invoices-${runId}.csv`
    try {
      archiveUrl = `r2://${config.r2BucketName}/${fileName}`

      // Upload to R2 via S3-compatible API
      const { AwsClient } = await import('aws4fetch')
      const r2 = new AwsClient({
        accessKeyId: config.r2AccessKeyId,
        secretAccessKey: config.r2SecretAccessKey,
      })
      const r2Url = `https://${config.r2AccountId}.r2.cloudflarestorage.com/${config.r2BucketName}/${fileName}`
      await r2.fetch(r2Url, {
        method: 'PUT',
        body: csv,
        headers: { 'Content-Type': 'text/csv' },
      })
    } catch (err: any) {
      console.warn('[EOM] R2 upload failed, continuing without archive:', err.message)
      archiveUrl = null
    }
  }

  // Mark run as complete
  await execute(
    `UPDATE eom_runs SET status = 'complete', notes = COALESCE(notes, '') || $2, updated_at = NOW() WHERE id = $1`,
    [runId, archiveUrl ? `\nArchived to: ${archiveUrl}` : '\nCSV not archived (R2 not configured)'],
  )

  return { archived: !!archiveUrl, archiveUrl, status: 'complete' }
})
