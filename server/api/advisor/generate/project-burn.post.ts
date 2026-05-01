/**
 * POST /api/advisor/generate/project-burn
 *
 * Auth wrapper around runProjectBurnGenerator. See server/utils/advisorGenerators.ts
 * for the actual logic — the cron handler also calls that runner.
 */

import { createError } from 'h3'
import { getSelectedTenant } from '~~/server/utils/session'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { runProjectBurnGenerator } from '~~/server/utils/advisorGenerators'

export default eventHandler(async (event) => {
  await requireAuth(event)
  await requireWriteAccess(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  return await runProjectBurnGenerator(tenantId)
})
