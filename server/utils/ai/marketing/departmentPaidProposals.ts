import { queryOneFresh, transactionWithoutRetry } from '~~/server/utils/db'
import { hashCanonicalLaunchJson } from '~~/server/utils/googlePmaxLaunchHash'
import { campaignDenied } from './departmentCampaignSupport'

export const paidHash = hashCanonicalLaunchJson
export interface PaidProposal {
  id: string
  user_id: string
  status: string
  expires_at: string
  resolved_payload: { clientId: string, action: string, input: Record<string, unknown>, revision: string, requestKey: string, digest: string, intentHash: string, review?: Record<string, unknown> }
  result_payload: Record<string, unknown> | null
}
const cols = 'id,user_id,status,expires_at,resolved_payload,result_payload'
export async function preparePaidProposal(action: string, actorId: string, input: Record<string, unknown>, snapshot: unknown, key: string, digest: string, source: 'mcp' | 'department_browser' = 'mcp', review?: Record<string, unknown>): Promise<PaidProposal> {
  if (!/^(mcp|browser):[a-f0-9]{64}$/.test(key) || !/^[a-f0-9]{64}$/.test(digest)) campaignDenied('coordinator_required')
  const intentHash = paidHash({ action, input })
  const revision = paidHash({ action, input, snapshot })
  return transactionWithoutRetry(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`${actorId}:${key}`])
    const prior = (await db.query(`SELECT ${cols} FROM ai_pending_actions WHERE user_id=$1 AND source IN ('mcp','department_browser') AND tool_name=$2 AND resolved_payload->>'requestKey'=$3`, [actorId, action, key])).rows[0] as PaidProposal | undefined
    if (prior) {
      if (prior.resolved_payload.intentHash !== intentHash || prior.resolved_payload.digest !== digest) campaignDenied('idempotency_conflict')
      return prior
    }
    const payload = { action, clientId: input.clientId, input, revision, requestKey: key, digest, intentHash, ...(review ? { review } : {}) }
    return (await db.query(`INSERT INTO ai_pending_actions (user_id,tool_name,resolved_payload,status,source,conversation_id)
   VALUES ($1,$2,$3::jsonb,'proposed',$4,NULL) RETURNING ${cols}`, [actorId, action, JSON.stringify(payload), source])).rows[0] as PaidProposal
  })
}
export async function readPaidProposal(id: string, action: string, clientId: string, actorId?: string): Promise<PaidProposal> {
  const p = await queryOneFresh<PaidProposal>(`SELECT ${cols} FROM ai_pending_actions WHERE id=$1 AND tool_name=$2 AND source IN ('mcp','department_browser') AND resolved_payload->>'clientId'=$3`, [id, action, clientId])
  if (!p || p.resolved_payload.action !== action || (actorId && p.user_id !== actorId)) campaignDenied('not_found')
  return p
}
export function paidProposalView(p: PaidProposal) {
  return { proposalId: p.id, clientId: p.resolved_payload.clientId, revision: p.resolved_payload.revision, status: p.status, expiresAt: p.expires_at,
    proposed: p.resolved_payload.input, review: p.resolved_payload.review ?? null, outcome: p.result_payload, reconciliationRequired: p.status === 'executed' && p.result_payload?.complete !== true }
}
export async function claimPaidProposal(p: PaidProposal) {
  const claimed = await transactionWithoutRetry(async (db) => {
    if (p.resolved_payload.action === 'department_catalog_change') {
      const catalogId = p.resolved_payload.input.catalogId
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`department-catalog:${catalogId}`])
      const held = (await db.query(`SELECT id FROM ai_pending_actions WHERE tool_name='department_catalog_change'
        AND status='executed' AND id<>$1 AND resolved_payload->'input'->>'catalogId'=$2
        AND (result_payload->>'complete') IS DISTINCT FROM 'true' LIMIT 1`, [p.id, catalogId])).rows[0]
      if (held) campaignDenied('reconciliation_required')
      const conflict = (await db.query(`SELECT client_id FROM meta_catalog_feed_bindings WHERE product_catalog_id=$1 AND client_id<>$2 LIMIT 1`, [catalogId, p.resolved_payload.clientId])).rows[0]
      if (conflict) campaignDenied('ownership_unproven')
    }
    return (await db.query(`UPDATE ai_pending_actions SET status='executed',executed_at=NOW()
      WHERE id=$1 AND user_id=$2 AND tool_name=$3 AND source IN ('mcp','department_browser') AND status='proposed' AND expires_at>NOW()
      AND resolved_payload=$4::jsonb AND result_payload IS NOT DISTINCT FROM $5::jsonb RETURNING id`,
    [p.id, p.user_id, p.resolved_payload.action, JSON.stringify(p.resolved_payload), p.result_payload ? JSON.stringify(p.result_payload) : null])).rows[0]
  })
  if (!claimed) campaignDenied('reconciliation_required')
}
export async function savePaidReceipt(p: PaidProposal, receipt: Record<string, unknown>) {
  await transactionWithoutRetry(async (db) => {
    const row = (await db.query(`UPDATE ai_pending_actions SET result_payload=$2::jsonb WHERE id=$1 AND status='executed' AND source IN ('mcp','department_browser') AND tool_name=$3 RETURNING id`, [p.id, JSON.stringify(receipt), p.resolved_payload.action])).rows[0]
    if (!row) campaignDenied('reconciliation_required')
  })
}
