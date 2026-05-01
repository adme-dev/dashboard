/**
 * POST /api/advisor/generate/retainer-cap
 *
 * Auth wrapper around runRetainerCapGenerator.
 */

import { createError } from 'h3'
import { getSelectedTenant } from '~~/server/utils/session'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { runRetainerCapGenerator } from '~~/server/utils/advisorGenerators'

export default eventHandler(async (event) => {
  await requireAuth(event)
  await requireWriteAccess(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  return await runRetainerCapGenerator(tenantId)
})
