import { createError, setHeader } from 'h3'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { getActiveMondayEvidenceScope } from '~~/server/utils/hr/mondayScope'
import { startGovernedMondaySync } from '~~/server/utils/hr/mondaySyncRunner'

/** Start an idempotent, approved-scope Monday synchronization. */
export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireHrAdmin(event)
  const scope = await getActiveMondayEvidenceScope()
  if (!scope) throw createError({ statusCode: 409, statusMessage: 'An approved Monday evidence scope is required before sync' })
  return startGovernedMondaySync(event, scope, user.id, 'manual')
})
