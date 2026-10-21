import { execute, queryOne } from '~~/server/utils/db'
import { resolveCreativeClientScope } from '~~/server/utils/ai/creativeClientScope'
import type { ClaimedProposal } from './writeTools'

/** Preserve agency access; a supplied dealer scope always narrows the atomic claim. */
export async function claimMcpProposal(proposalId: string, userId: string, clientScope?: string): Promise<ClaimedProposal | null> {
  const scope = resolveCreativeClientScope({ clientScope })
  return await queryOne<ClaimedProposal>(
    `UPDATE ai_pending_actions SET status='executed', confirmed_by=$2, executed_at=now()
      WHERE id = $1 AND user_id = $2 AND status='proposed' AND source='mcp' AND expires_at > now()
        AND ($3::uuid IS NULL OR client_scope = $3::uuid)
      RETURNING tool_name, resolved_payload`,
    [proposalId, userId, scope ?? null]
  ).catch(() => null)
}

/** Only restore a pre-dispatch rejection within the original user and dealer boundary. */
export async function revertMcpProposal(proposalId: string, userId: string, clientScope?: string): Promise<void> {
  const scope = resolveCreativeClientScope({ clientScope })
  await execute(
    `UPDATE ai_pending_actions SET status='proposed', confirmed_by=NULL, executed_at=NULL
      WHERE id = $1 AND user_id = $2 AND status='executed' AND source='mcp'
        AND ($3::uuid IS NULL OR client_scope = $3::uuid)`,
    [proposalId, userId, scope ?? null]
  ).catch(() => {})
}
