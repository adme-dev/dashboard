import type { H3Event } from 'h3'

/**
 * Portal Tier-2 confirm/execute spine (portal-agent spec §5, §8). The customer-facing analog of the
 * agency confirm endpoint — reuses ai_pending_actions + ai_action_audit (client_scope-tagged) but
 * claims by (clientUserId + clientScope), so a proposal can only ever be executed by the same client
 * user that staged it, for the same tenant. Injected deps keep the claim/execute/audit logic unit-testable.
 */

export interface PortalPendingRow {
  id: string
  status: string
  tool_name: string
  resolved_payload: any
  user_id: string
  client_scope: string
  expires_at: string
}

export interface PortalConfirmDb {
  /** ATOMIC claim: status proposed→executed WHERE id+user_id+client_scope match and not expired. */
  claim(proposalId: string, clientUserId: string, clientScope: string): Promise<PortalPendingRow | null>
  markExecuted(id: string, resultRef: string): Promise<void>
  revert(id: string): Promise<void>
}

/** The real mutation for a confirmed proposal (calls the tenant-safe portal endpoint). Throws on failure. */
export type PortalExecutor = (payload: any, event: H3Event) => Promise<{ resultRef: string, summary: string }>

export interface PortalConfirmAudit {
  pendingId: string
  clientUserId: string
  toolName: string
  clientScope: string
  payload: unknown
  resultRef: string | null
  outcome: 'executed' | 'failed'
}

export type PortalConfirmResult =
  | { ok: true, resultRef: string, summary: string }
  | { ok: false, error: string }

/**
 * Claim, execute, and audit a confirmed portal proposal. Idempotent (a second confirm claims nothing).
 * An unknown tool_name is terminal (no revert → not re-confirmable); a genuine mutation failure reverts
 * so the customer can retry. Every claimed attempt is audited (client_scope-tagged).
 */
export async function executePortalProposal(opts: {
  proposalId: string
  clientUserId: string
  clientScope: string
  event: H3Event
  db: PortalConfirmDb
  getExecutor: (toolName: string) => PortalExecutor | null
  audit: (a: PortalConfirmAudit) => Promise<void>
}): Promise<PortalConfirmResult> {
  const { proposalId, clientUserId, clientScope, event, db, getExecutor, audit } = opts

  const row = await db.claim(proposalId, clientUserId, clientScope)
  if (!row) {
    return { ok: false, error: 'This action was already handled, has expired, or is not yours to confirm.' }
  }

  const executor = getExecutor(row.tool_name)
  if (!executor) {
    // Terminal: leave the row claimed (executed) so it can't loop; record the failed attempt.
    await audit({ pendingId: row.id, clientUserId, toolName: row.tool_name, clientScope, payload: row.resolved_payload, resultRef: null, outcome: 'failed' })
    return { ok: false, error: 'This action can no longer be completed.' }
  }

  let result: { resultRef: string, summary: string }
  try {
    result = await executor(row.resolved_payload, event)
  } catch {
    await db.revert(row.id)
    await audit({ pendingId: row.id, clientUserId, toolName: row.tool_name, clientScope, payload: row.resolved_payload, resultRef: null, outcome: 'failed' })
    return { ok: false, error: 'Could not complete the action. Please try again.' }
  }

  try {
    await db.markExecuted(row.id, result.resultRef)
  } catch {
    console.error(`[portalConfirm] markExecuted failed for ${row.id}`)
  }
  await audit({ pendingId: row.id, clientUserId, toolName: row.tool_name, clientScope, payload: row.resolved_payload, resultRef: result.resultRef, outcome: 'executed' })
  return { ok: true, resultRef: result.resultRef, summary: result.summary }
}

/** Portal executor registry — only portal-safe write executors. Mirrors the propose tools' names. */
export const portalExecutors: Record<string, PortalExecutor> = {
  respond_to_approval: async (payload, event) => {
    // Call the tenant-safe portal endpoint (re-checks clientAuth + canApproveWork + ownership).
    await $fetch(`/api/portal/approvals/${payload.approvalId}/respond`, {
      method: 'POST',
      headers: event.headers as any,
      body: { action: payload.action, notes: payload.notes ?? undefined },
    })
    const verb = payload.action === 'approve' ? 'Approved' : payload.action === 'reject' ? 'Rejected' : 'Requested a revision on'
    return { resultRef: String(payload.approvalId), summary: `✅ ${verb} the approval${payload.title ? ` “${payload.title}”` : ''}.` }
  },
}

export function getPortalExecutor(toolName: string): PortalExecutor | null {
  return portalExecutors[toolName] ?? null
}
