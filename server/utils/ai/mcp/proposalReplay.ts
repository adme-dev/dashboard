import { execute, queryOne } from '~~/server/utils/db'
import type { WriteConfirmOutcome } from './writeTools'

interface ExecutedProposal {
  tool_name: string
  result_payload: unknown
  resolved_payload: Record<string, unknown> | null
  executed_at: string | null
}

/** Replay the exact result for a confirmed proposal without repeating its mutation. */
export async function replayExecutedMcpProposal(proposalId: string, userId: string): Promise<WriteConfirmOutcome | null> {
  const proposal = await queryOne<ExecutedProposal>(
    `SELECT tool_name, result_payload, resolved_payload, executed_at
       FROM ai_pending_actions
      WHERE id = $1 AND user_id = $2 AND source = 'mcp' AND status = 'executed'`,
    [proposalId, userId]
  )
  if (!proposal) return null
  if (proposal.result_payload !== null && proposal.result_payload !== undefined) {
    return { ok: true, data: proposal.result_payload }
  }

  // Compatibility recovery for proposals executed before result_payload existed.
  if (proposal.tool_name === 'video_generation') {
    const projectId = String(proposal.resolved_payload?.projectId ?? '')
    const job = await queryOne<{ id: string; status: string; error_message: string | null }>(
      `SELECT id, status, error_message FROM video_generation_jobs
        WHERE created_by = $1
          AND project_id = NULLIF($2, '')::uuid
          AND (
            idempotency_key = $3
            OR ($4::timestamptz IS NOT NULL AND created_at BETWEEN $4::timestamptz - interval '5 seconds' AND $4::timestamptz + interval '30 seconds')
          )
        ORDER BY CASE WHEN idempotency_key = $3 THEN 0 ELSE 1 END, created_at ASC
        LIMIT 1`,
      [userId, projectId, `mcp:${proposalId}`, proposal.executed_at]
    )
    if (job) {
      const data = {
        jobId: job.id,
        status: job.status,
        ...(job.error_message ? { error: job.error_message } : {})
      }
      await persistMcpProposalResult(proposalId, userId, data)
      return { ok: true, data }
    }
  }
  return null
}

export async function persistMcpProposalResult(proposalId: string, userId: string, data: unknown): Promise<void> {
  await execute(
    `UPDATE ai_pending_actions
        SET result_payload = COALESCE(result_payload, $3::jsonb),
            result_ref = COALESCE(result_ref, NULLIF($3::jsonb->>'jobId', ''), NULLIF($3::jsonb->>'projectId', ''), NULLIF($3::jsonb->>'sourceAssetId', ''))
      WHERE id = $1 AND user_id = $2 AND source = 'mcp' AND status = 'executed'`,
    [proposalId, userId, JSON.stringify(data)]
  )
}
