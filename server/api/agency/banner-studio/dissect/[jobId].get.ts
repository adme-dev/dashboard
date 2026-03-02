import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const jobId = getRouterParam(event, 'jobId')
  if (!jobId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing jobId' })
  }

  const row = await queryOne(
    `SELECT job_id, status, manifest, error, created_at, updated_at
     FROM banner_dissections WHERE job_id = $1`,
    [jobId]
  )

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Dissection job not found' })
  }

  if (row.status === 'complete' && row.manifest) {
    return row.manifest
  }

  return {
    jobId: row.job_id,
    status: row.status,
    error: row.error || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
})
