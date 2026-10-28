import type { RiskTier } from '../toolContext'
import { isDepartmentTool, isDepartmentWriteTool } from './departmentToolNames'
/** Audit classes describe what happened, without persisting arguments or provider payloads. */
export function departmentAudit(name: string, args: unknown, result: { ok: boolean, data?: unknown, error?: string, code?: string }, registeredRiskTier?: RiskTier): {
  riskTier: RiskTier
  outcome: string
  pendingId: string | null
  actionClass: string
} | null {
  if (!isDepartmentTool(name))
    return null

  const input = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>

  const data = (result.ok && result.data && typeof result.data === 'object' ? result.data : {}) as Record<string, unknown>

  const writing = isDepartmentWriteTool(name)

  const proposal = /marketing_(?:propose|prepare)_/.test(name)

  const review = /marketing_(?:review|approve)_/.test(name)

  const validation = /marketing_preflight_/.test(name)

  const actionClass = !writing ? 'read' : proposal ? 'proposal' : review ? 'review' : validation ? 'validation' : 'execution'

  const reviewOutcome = input.decision === 'reject' || input.decision === 'rejected'
    ? 'rejected'
    : input.decision === 'returned_to_draft' ? 'returned_to_draft' : 'approved'

  let outcome = result.ok ? (!writing ? 'read' : proposal ? 'proposed' : review ? reviewOutcome : validation ? 'validated' : 'executed') : 'failed'

  if (result.ok && writing && ['unknown', 'partial', 'failed', 'queued', 'accepted', 'pending'].includes(String(data.status)))
    outcome = String(data.status)

  if (writing && (result.code === 'reconciliation_required' || data.reconciliationRequired === true || data.ledgerRecorded === false || data.status === 'reconciliation_required'))
    outcome = 'unknown'

  // These families use ai_pending_actions. Other domain IDs must never enter its FK.
  const nativePending = new Set([
    'marketing_get_budget_proposal', 'marketing_propose_budget_allocations', 'marketing_review_budget_allocations',
    'marketing_propose_inventory_feed_setup', 'marketing_propose_inventory_feed_change', 'marketing_propose_inventory_feed_regeneration',
    'marketing_get_inventory_feed_change', 'marketing_review_inventory_feed_change', 'marketing_execute_inventory_feed_change',
    'marketing_propose_lead_routing_change', 'marketing_get_lead_routing_change', 'marketing_review_lead_routing_change', 'marketing_execute_lead_routing_change',
    'marketing_propose_email_campaign_send', 'marketing_get_email_send_proposal', 'marketing_review_email_campaign_send', 'marketing_execute_email_campaign_send',
    'marketing_prepare_meta_ad_launch', 'marketing_get_meta_ad_launch', 'marketing_approve_meta_ad_launch', 'marketing_execute_meta_ad_launch',
    'marketing_propose_catalog_feed', 'marketing_propose_product_set_change', 'marketing_get_catalog_change', 'marketing_approve_catalog_change', 'marketing_execute_catalog_change'
  ]).has(name)

  const candidate = data.proposalId ?? input.proposalId

  const pendingId = result.ok && nativePending && typeof candidate === 'string' && /^[0-9a-f-]{36}$/i.test(candidate) ? candidate : null

  return { riskTier: registeredRiskTier ?? (writing ? 'confirm' : 'auto'), outcome, pendingId, actionClass }
}
