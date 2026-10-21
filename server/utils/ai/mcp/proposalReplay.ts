import { resolveCreativeClientScope } from '~~/server/utils/ai/creativeClientScope'
import { execute, queryOne } from '~~/server/utils/db'
import type { WriteConfirmOutcome } from './writeTools'

interface ExecutedProposal {
  tool_name: string
  result_payload: unknown
  resolved_payload: Record<string, unknown> | null
  executed_at: string | null
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

/** Saved output is not authority: recheck current ownership before disclosing creative results. */
async function canReplayCreativeResult(proposal: ExecutedProposal, clientScope: string): Promise<boolean> {
  const data = proposal.result_payload
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false
  const result = data as Record<string, unknown>
  const projectId = proposal.tool_name === 'video_project_create'
    ? result.projectId
    : proposal.resolved_payload?.projectId
  if (!isUuid(projectId)) return false

  if (proposal.tool_name === 'video_project_create') {
    return !!await queryOne(
      `SELECT id FROM banner_projects WHERE id = $1 AND client_id = $2::uuid`,
      [projectId, clientScope]
    )
  }
  if (proposal.tool_name === 'video_generation') {
    if (!isUuid(result.jobId)) return false
    return !!await queryOne(
      `SELECT j.id FROM video_generation_jobs j
         JOIN banner_projects p ON p.id = j.project_id
        WHERE j.id = $1 AND j.project_id = $2 AND j.tenant_id = $3::text AND p.client_id = $3::uuid`,
      [result.jobId, projectId, clientScope]
    )
  }
  if (proposal.tool_name === 'video_source_promote') {
    if (!isUuid(result.sourceAssetId)) return false
    return !!await queryOne(
      `SELECT s.id FROM video_gen_source_assets s
         JOIN banner_projects p ON p.id = $2::uuid
        WHERE s.id = $1 AND s.client_id = $3::uuid AND p.client_id = $3::uuid`,
      [result.sourceAssetId, projectId, clientScope]
    )
  }
  if (proposal.tool_name === 'banner_render') {
    if (!Array.isArray(result.jobIds) || result.jobIds.length === 0
      || result.jobIds.length > 200 || !result.jobIds.every(isUuid)) return false
    const ids = [...new Set(result.jobIds.map(id => id.toLowerCase()))]
    const row = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM banner_render_jobs j
         JOIN banner_projects p ON p.id = j.project_id
        WHERE j.id = ANY($1::uuid[]) AND j.project_id = $2 AND p.client_id = $3::uuid`,
      [ids, projectId, clientScope]
    )
    return row?.count === ids.length
  }
  // Other action families need their own resource authorizer before dealer replay is enabled.
  return false
}

/** Replay the exact result for a confirmed proposal without repeating its mutation. */
export async function replayExecutedMcpProposal(proposalId: string, userId: string, clientScope?: string): Promise<WriteConfirmOutcome | null> {
  const scope = resolveCreativeClientScope({ clientScope })
  const proposal = await queryOne<ExecutedProposal>(
    `SELECT tool_name, result_payload, resolved_payload, executed_at
       FROM ai_pending_actions
      WHERE id = $1 AND user_id = $2 AND source = 'mcp' AND status = 'executed'
        AND ($3::uuid IS NULL OR client_scope = $3::uuid)`,
    [proposalId, userId, scope ?? null]
  )
  if (!proposal) return null
  if (proposal.result_payload !== null && proposal.result_payload !== undefined) {
    if (scope && !await canReplayCreativeResult(proposal, scope)) return null
    return { ok: true, data: proposal.result_payload }
  }

  // Compatibility recovery for proposals executed before result_payload existed.
  if (proposal.tool_name === 'video_generation') {
    const projectId = String(proposal.resolved_payload?.projectId ?? '')
    if (scope && !isUuid(projectId)) return null
    const job = await queryOne<{ id: string, status: string, error_message: string | null }>(
      `SELECT id, status, error_message FROM video_generation_jobs
        WHERE created_by = $1
          AND project_id = NULLIF($2, '')::uuid
          AND ($5::text IS NULL OR (tenant_id = $5::text AND idempotency_key = $3
            AND EXISTS (SELECT 1 FROM banner_projects p WHERE p.id = project_id AND p.client_id = $5::uuid)))
          AND (
            idempotency_key = $3
            OR ($4::timestamptz IS NOT NULL AND created_at BETWEEN $4::timestamptz - interval '5 seconds' AND $4::timestamptz + interval '30 seconds')
          )
        ORDER BY CASE WHEN idempotency_key = $3 THEN 0 ELSE 1 END, created_at ASC
        LIMIT 1`,
      [userId, projectId, `mcp:${proposalId}`, proposal.executed_at, scope ?? null]
    )
    if (job) {
      const data = {
        jobId: job.id,
        status: job.status,
        ...(job.error_message ? { error: job.error_message } : {})
      }
      await persistMcpProposalResult(proposalId, userId, data, scope)
      return { ok: true, data }
    }
  }
  return null
}

export async function persistMcpProposalResult(proposalId: string, userId: string, data: unknown, clientScope?: string): Promise<void> {
  const scope = resolveCreativeClientScope({ clientScope })
  await execute(
    `UPDATE ai_pending_actions
        SET result_payload = COALESCE(result_payload, $3::jsonb),
            result_ref = COALESCE(result_ref, NULLIF($3::jsonb->>'jobId', ''), NULLIF($3::jsonb->>'projectId', ''), NULLIF($3::jsonb->>'sourceAssetId', ''))
      WHERE id = $1 AND user_id = $2 AND source = 'mcp' AND status = 'executed'
        AND ($4::uuid IS NULL OR client_scope = $4::uuid)`,
    [proposalId, userId, JSON.stringify(data), scope ?? null]
  )
}
