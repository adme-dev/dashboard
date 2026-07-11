import { createError, readBody, setHeader } from 'h3'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { getActiveMondayEvidenceScope } from '~~/server/utils/hr/mondayScope'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { reconcileMondaySyncSession } from '~~/server/utils/hr/mondaySyncReconcile'

/** Reconcile durable HR sync state with an existing migration session. */
export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireHrAdmin(event)
  const scope = await getActiveMondayEvidenceScope()
  if (!scope) throw createError({ statusCode: 409, statusMessage: 'No approved Monday evidence scope is active' })
  const body = await readBody<{ sessionId?: string }>(event)
  if (!body?.sessionId) throw createError({ statusCode: 400, statusMessage: 'sessionId is required' })
  const result = await reconcileMondaySyncSession(scope.id, scope.board_ids, body.sessionId)
  if (!result) throw createError({ statusCode: 404, statusMessage: 'Migration session not found' })
  const { session, boards: states } = result
  await recordHrAuditEvent({ actorId: user.id, action: 'monday_evidence.sync.reconciled', targetType: 'monday_migration_session', targetId: session.id, metadata: { scopeId: scope.id, status: session.status, boardCount: scope.board_ids.length } })
  return { ok: true, sessionId: session.id, status: session.status, states }
})
