import { z } from 'zod'
import { queryRows } from '~~/server/utils/db'
import { isReadOnlyRole } from '~~/server/utils/permissions'
import type { AiTool } from '../toolRegistry'
import { ok, fail, escapeLike, capWithMore, type ToolContext, type ToolResult, isConversationlessProposeContext } from '../toolContext'
import { proposeAction } from '../pendingActions'
import { pickByExactName, type NamedRef } from './createTask'

/**
 * Creative tools (PRD §7 Graphic Designer): the creative's proof queue (read) and a proof-status change
 * (propose→confirm). Banner/image GENERATION is intentionally out of scope here — it's a heavy, synchronous,
 * concurrency-capped render better driven from the Banner Studio UI than a chat propose→confirm.
 */

const ilike = (name: string) => `%${escapeLike(name)}%`

const PROOF_STATUSES = ['draft', 'internal_review', 'client_review', 'changes_requested', 'approved', 'rejected', 'archived'] as const

// ---------- get_my_creative_queue (read) ----------
export type CreativeQueueDeps = {
  fetchQueue: (userId: string) => Promise<Array<{ id: string, name: string, proof_type: string, status: string, due_date: string | null, is_urgent: boolean }>>
}

const queueDeps: CreativeQueueDeps = {
  // Proofs where the caller is a PENDING approver (their personal review queue). Scoped to ctx.userId.
  fetchQueue: (userId) =>
    queryRows(
      `SELECT p.id, p.name, p.proof_type, p.status, p.due_date, p.is_urgent
         FROM creative_proofs p
         JOIN proof_approvers pa ON pa.proof_id = p.id
        WHERE pa.team_member_id = $1 AND pa.status = 'pending'
        ORDER BY p.is_urgent DESC, p.due_date ASC NULLS LAST
        LIMIT 50`,
      [userId]),
}

export async function getMyCreativeQueue(_args: Record<string, never>, ctx: ToolContext, deps: CreativeQueueDeps = queueDeps): Promise<ToolResult> {
  try {
    const rows = await deps.fetchQueue(ctx.userId)
    const { items, more } = capWithMore(rows, 25)
    return ok({ proofs: items, more })
  } catch {
    return fail('Could not load your creative queue right now.')
  }
}

export const creativeQueueTool: AiTool<Record<string, never>> = {
  name: 'get_my_creative_queue',
  description: 'The proofs awaiting THIS user\'s review/approval — name, type, status, due date and urgency. '
    + 'Use for "what\'s in my queue", "what do I need to review", "what\'s due". Read-only; capped at 25 with a `more` count.',
  parameters: z.object({}),
  returnsUntrusted: true,
  handler: (a, c) => getMyCreativeQueue(a, c),
}

// ---------- propose_proof_status (write) ----------
const statusParams = z.object({
  proofName: z.string(),
  status: z.enum(PROOF_STATUSES),
})
type StatusArgs = z.infer<typeof statusParams>

export type ProofStatusDeps = {
  resolveProof: (name: string) => Promise<NamedRef[]>
  propose: (ctx: ToolContext, payload: unknown) => Promise<string>
}

const proofDeps: ProofStatusDeps = {
  resolveProof: (name) =>
    queryRows<NamedRef>(`SELECT id, name FROM creative_proofs WHERE name ILIKE $1 AND status <> 'archived' ORDER BY (lower(name)=lower($2)) DESC, created_at DESC LIMIT 6`, [ilike(name), name]),
  propose: (ctx, payload) => proposeAction(ctx, ctx.conversationId ?? null, 'propose_proof_status', payload),
}

export async function proposeProofStatus(args: StatusArgs, ctx: ToolContext, deps: ProofStatusDeps = proofDeps): Promise<ToolResult> {
  if (isReadOnlyRole(ctx.userRole)) return fail('You do not have permission to change a proof\'s status.')
  if (!isConversationlessProposeContext(ctx)) return fail('Cannot prepare this action outside a conversation.')
  const matches = pickByExactName(await deps.resolveProof(args.proofName), args.proofName)
  if (matches.length === 0) return fail(`No proof matching "${args.proofName}".`)
  if (matches.length > 1) return ok({ disambiguation: { field: 'proofName', options: matches } })
  const proof = matches[0]!
  const resolved = { proofId: proof.id, proofName: proof.name, status: args.status }
  return ok({ proposalId: await deps.propose(ctx, resolved), resolved })
}

export const proofStatusTool: AiTool<StatusArgs> = {
  name: 'propose_proof_status',
  description: 'PROPOSE setting a proof\'s status (e.g. internal_review, client_review, approved, changes_requested). '
    + 'Does NOT change anything — prepares a proposal the user confirms. Give the proof name and the target status. '
    + 'If the result has a `disambiguation`, ask the user to pick. Only say it\'s ready when there is a `proposalId`.',
  parameters: statusParams,
  mutates: true,
  requiredPermission: 'CREATIVE',
  handler: (a, c) => proposeProofStatus(a, c),
}
