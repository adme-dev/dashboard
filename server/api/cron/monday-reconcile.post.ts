import { createError, getHeader, setHeader } from 'h3'
import { getActiveMondayEvidenceScope } from '~~/server/utils/hr/mondayScope'
import { startGovernedMondaySync } from '~~/server/utils/hr/mondaySyncRunner'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const secret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET)) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const scope = await getActiveMondayEvidenceScope()
  if (!scope) return { ok: true, status: 'skipped', reason: 'NO_APPROVED_SCOPE' }
  if (!scope.approved_by) return { ok: true, status: 'skipped', reason: 'SCOPE_HAS_NO_APPROVER' }
  return startGovernedMondaySync(event, scope, scope.approved_by, 'scheduled')
})
