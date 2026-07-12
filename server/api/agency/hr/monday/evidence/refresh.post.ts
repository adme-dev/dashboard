import { createError, setHeader } from 'h3'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { refreshMondayEvidenceExtracts } from '~~/server/utils/hr/mondayEvidenceExtract'
import { getActiveMondayEvidenceScope } from '~~/server/utils/hr/mondayScope'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireHrAdmin(event)
  const scope = await getActiveMondayEvidenceScope()
  if (!scope) throw createError({ statusCode: 409, statusMessage: 'An approved Monday evidence scope is required' })
  const result = await refreshMondayEvidenceExtracts(scope)
  await recordHrAuditEvent({
    actorId: user.id,
    action: 'monday_evidence.extract_refreshed',
    targetType: 'monday_evidence_scope',
    targetId: scope.id,
    metadata: result,
  })
  return { ok: true, scopeId: scope.id, ...result, rawPayloadCopied: false }
})
