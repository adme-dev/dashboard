/**
 * DELETE /api/agency/eom/runs/:id
 * Delete an EOM run (only if draft or review status)
 */

import { createError, getRouterParam } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Run ID is required' })
  }

  const run = await queryOne<{ status: string }>(
    `SELECT status FROM eom_runs WHERE id = $1`,
    [id],
  )

  if (!run) {
    throw createError({ statusCode: 404, statusMessage: 'EOM run not found' })
  }

  if (run.status !== 'draft' && run.status !== 'review' && run.status !== 'failed') {
    throw createError({
      statusCode: 400,
      statusMessage: `Cannot delete a run with status '${run.status}'. Only draft, review, or failed runs can be deleted.`,
    })
  }

  // CASCADE on eom_line_items handles child rows
  await execute(`DELETE FROM eom_runs WHERE id = $1`, [id])

  return { success: true, message: 'EOM run deleted' }
})
