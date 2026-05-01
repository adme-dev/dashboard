/**
 * POST /api/advisor/generate/agi-per-fte
 *
 * Auth wrapper around runAgiPerFteGenerator (needs Xero token for T90d revenue).
 */

import { createError } from 'h3'
import { getActiveTokenForSession } from '~~/server/utils/tokenStore'
import { getSelectedTenant } from '~~/server/utils/session'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { runAgiPerFteGenerator } from '~~/server/utils/advisorGenerators'

export default eventHandler(async (event) => {
  await requireAuth(event)
  await requireWriteAccess(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const token = await getActiveTokenForSession(event)
  return await runAgiPerFteGenerator(tenantId, token.access_token!)
})
