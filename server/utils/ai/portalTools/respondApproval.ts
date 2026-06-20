import { z } from 'zod'
import { ok, fail, portalDb, proposePortalAction, type PortalAiTool, type PortalToolContext, type ToolResult } from './portalContext'

const params = z.object({
  approvalId: z.string().uuid(),
  action: z.enum(['approve', 'reject', 'revision_requested']),
  notes: z.string().trim().max(2000).optional(),
})
type Args = z.infer<typeof params>

/**
 * Portal Tier 2 — the FIRST customer-facing write (portal-agent spec §13.1). PROPOSES a response to one
 * of the client's pending approvals; the portal confirm endpoint executes it via the existing
 * /api/portal/approvals/:id/respond endpoint (which re-checks clientAuth + canApproveWork + ownership).
 *
 * Tenant boundary: the approval is verified to belong to THIS client (clientScope = $1) and to be
 * pending BEFORE a proposal is staged — the model can't act on another client's or an already-decided
 * approval. The proposal carries only ids/action/notes; nothing is mutated here.
 */
export async function proposeRespondToApproval(args: Args, ctx: PortalToolContext): Promise<ToolResult> {
  try {
    if ((args.action === 'reject' || args.action === 'revision_requested') && !args.notes) {
      return fail('Please include a note explaining the change before I submit a rejection or revision request.')
    }
    // clientScope is $1 — the tenant boundary (same invariant as the read tools).
    const approval = await portalDb(ctx).queryOne<{ id: string, status: string, title: string }>(
      `SELECT ca.id, ca.status, ca.title
       FROM client_approvals ca
       JOIN projects p ON ca.project_id = p.id
       WHERE p.client_id = $1 AND ca.id = $2`,
      [ctx.clientScope, args.approvalId],
    )
    if (!approval) return fail('I couldn\'t find that approval in your portal.')
    if (approval.status !== 'pending') return fail(`That approval has already been ${approval.status}.`)

    const resolved = { approvalId: args.approvalId, action: args.action, notes: args.notes ?? null, title: approval.title }
    const proposalId = await proposePortalAction(ctx, 'respond_to_approval', resolved)
    return ok({ proposalId, resolved })
  } catch {
    return fail('Could not prepare that approval response right now.')
  }
}

export const respondToApprovalTool: PortalAiTool<Args> = {
  name: 'respond_to_approval',
  description: 'Respond to one of the customer\'s PENDING approvals — approve, reject, or request a revision. '
    + 'Use when the customer asks to "approve <item>", "reject this proof", "ask for changes". A note is required '
    + 'for reject/revision. This PROPOSES the response for the customer to confirm — it does not act until they click confirm.',
  parameters: params,
  mutates: true,
  riskTier: 'confirm',
  handler: proposeRespondToApproval,
}
