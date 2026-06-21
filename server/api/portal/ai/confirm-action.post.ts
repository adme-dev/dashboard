/**
 * POST /api/portal/ai/confirm-action — execute a confirmed portal Tier-2 proposal (Option B).
 * Customer-facing (clientAuth). DOUBLY gated: AI_PORTAL_ENABLED + AI_PORTAL_WRITES_ENABLED. The client
 * supplies ONLY a proposalId — never the payload. The claim is bound to (client_user_id + client_scope)
 * so a proposal is only executable by the same client user that staged it, for the same tenant.
 */
import { queryOne, execute } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { recordAudit } from '~~/server/utils/ai/audit'
import {
  executePortalProposal, getPortalExecutor,
  type PortalConfirmDb, type PortalPendingRow,
} from '~~/server/utils/ai/portalConfirm'

export default defineEventHandler(async (event) => {
  const cfg = useRuntimeConfig() as any
  if (!cfg.aiPortalEnabled || !cfg.aiPortalWritesEnabled) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const clientUser = await requireClientAuth(event)
  const body = await readBody<{ proposalId?: string }>(event)
  const proposalId = body?.proposalId
  if (!proposalId) throw createError({ statusCode: 400, statusMessage: 'proposalId is required' })

  const db: PortalConfirmDb = {
    claim: async (id, clientUserId, clientScope) => queryOne<PortalPendingRow>(
      `UPDATE ai_pending_actions
         SET status = 'executed', confirmed_by = $1, executed_at = NOW()
       WHERE id = $2 AND user_id = $1 AND client_scope = $3
         AND status = 'proposed' AND expires_at > NOW()
       RETURNING id, status, tool_name, resolved_payload, user_id, client_scope, expires_at`,
      [clientUserId, id, clientScope],
    ),
    markExecuted: async (id, resultRef) => { await execute(`UPDATE ai_pending_actions SET result_ref = $1 WHERE id = $2`, [resultRef, id]) },
    revert: async (id) => { await execute(`UPDATE ai_pending_actions SET status = 'proposed', confirmed_by = NULL, executed_at = NULL WHERE id = $1`, [id]) },
  }

  const result = await executePortalProposal({
    proposalId,
    clientUserId: clientUser.id,
    clientScope: clientUser.clientId,
    event,
    db,
    getExecutor: getPortalExecutor,
    audit: a => recordAudit({
      pendingId: a.pendingId,
      userId: a.clientUserId,        // proposer = the portal user
      confirmedBy: a.clientUserId,   // same client user confirms
      toolName: a.toolName,
      riskTier: 'confirm',
      clientScope: a.clientScope,
      payload: a.payload,
      resultRef: a.resultRef,
      outcome: a.outcome,
    }),
  })

  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, resultRef: result.resultRef, summary: result.summary }
})
