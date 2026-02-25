/**
 * POST /api/agency/eom/runs/:id/regenerate
 * Delete existing line items and re-run generation for same month/year
 */

import { createError, getRouterParam } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { regenerateEomRun } from '~~/server/utils/eomEngine'

export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Run ID is required' })
  }

  try {
    const result = await regenerateEomRun(id, user.id, event)
    return result
  } catch (err: any) {
    console.error('[EOM] Regeneration failed:', err)
    throw createError({
      statusCode: err.message?.includes('not found') ? 404 : 500,
      statusMessage: err.message || 'Regeneration failed',
    })
  }
})
