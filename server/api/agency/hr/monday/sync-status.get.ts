import { setHeader } from 'h3'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { getActiveMondayEvidenceScope } from '~~/server/utils/hr/mondayScope'
import { listMondaySyncStates } from '~~/server/utils/hr/mondaySyncState'
import { getMondayReconciliationSummary } from '~~/server/utils/hr/mondayReconciliationStatus'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  await requireHrAdmin(event)
  const scope = await getActiveMondayEvidenceScope()
  if (!scope) return { active: false, states: [] }
  const [states, reconciliation] = await Promise.all([
    listMondaySyncStates(scope.id),
    getMondayReconciliationSummary(scope.board_ids),
  ])
  return { active: true, scopeId: scope.id, states, reconciliation }
})
