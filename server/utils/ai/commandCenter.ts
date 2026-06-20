/**
 * Command Center v1 — Observe (command-center spec §4/§6). PURE shapers over the Phase-0 ledgers
 * (ai_pending_actions, ai_action_audit, ai_messages cost, ai_user_memory) — no new state. The endpoint
 * runs the SQL and feeds rows here; this file just normalizes them into the client shape, so the
 * assembly is unit-tested without a DB. Read-only — the Command Center never writes.
 */

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export interface ProposalRow {
  id: string
  tool_name: string
  user_id: string
  user_name?: string | null
  created_at: string
  expires_at: string
  resolved_payload?: any
}
export interface AuditRow {
  id: string
  tool_name: string
  risk_tier: string
  user_id: string
  user_name?: string | null
  confirmed_by?: string | null
  confirmer_name?: string | null
  outcome: string
  result_ref?: string | null
  client_scope?: string | null
  created_at: string
}
export interface UsageRow {
  cost_usd?: unknown
  prompt_tokens?: unknown
  completion_tokens?: unknown
}

export function mapProposal(r: ProposalRow) {
  return {
    id: r.id,
    toolName: r.tool_name,
    proposedBy: r.user_name ?? r.user_id,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    // a one-line summary of the resolved payload for the queue (full payload stays server-side)
    summary: payloadSummary(r.tool_name, r.resolved_payload),
  }
}

export function mapAuditRow(r: AuditRow) {
  return {
    id: r.id,
    toolName: r.tool_name,
    riskTier: r.risk_tier,
    proposedBy: r.user_name ?? r.user_id,
    confirmedBy: r.confirmer_name ?? r.confirmed_by ?? null,
    outcome: r.outcome,
    resultRef: r.result_ref ?? null,
    clientScoped: !!r.client_scope,
    createdAt: r.created_at,
  }
}

/** A compact, human-readable summary of a proposal's payload, by tool. */
export function payloadSummary(toolName: string, payload: any): string {
  if (!payload || typeof payload !== 'object') return ''
  switch (toolName) {
    case 'create_task': return payload.title ?? 'New task'
    case 'propose_budget_change':
      return `${payload.campaignName ?? 'Campaign'}: ${payload.currentDailyBudget}→${payload.newDailyBudget}/day`
    case 'propose_budget_alert': return `Alert for ${payload.clientName ?? 'client'}: ${payload.title ?? ''}`.trim()
    case 'propose_schedule_post': return `Post for ${payload.clientName ?? 'client'} (${payload.status ?? 'draft'})`
    default: return payload.title ?? payload.campaignName ?? payload.clientName ?? ''
  }
}

/** Roll a window of assistant turns into cost/token/turn totals. */
export function summarizeUsage(rows: UsageRow[]): { turns: number, costUsd: number, tokens: number } {
  let costUsd = 0
  let tokens = 0
  for (const r of rows) {
    costUsd += num(r.cost_usd)
    tokens += num(r.prompt_tokens) + num(r.completion_tokens)
  }
  // round cost to 4dp (sub-cent) for display stability
  return { turns: rows.length, costUsd: Math.round(costUsd * 10000) / 10000, tokens }
}

/** Group audit rows into per-tool outcome tallies (executed / failed / rolled_back). */
export function auditByTool(rows: AuditRow[]): Array<{ toolName: string, executed: number, failed: number, total: number }> {
  const by = new Map<string, { executed: number, failed: number, total: number }>()
  for (const r of rows) {
    const e = by.get(r.tool_name) ?? { executed: 0, failed: 0, total: 0 }
    e.total++
    if (r.outcome === 'executed') e.executed++
    else if (r.outcome === 'failed') e.failed++
    by.set(r.tool_name, e)
  }
  return [...by.entries()].map(([toolName, v]) => ({ toolName, ...v })).sort((a, b) => b.total - a.total)
}

export interface OverviewInput {
  proposals: ProposalRow[]
  audit: AuditRow[]
  /** Pre-aggregated by the endpoint (SQL SUM over the window) to avoid over-fetching turns. */
  usage: { turns: number, costUsd: number, tokens: number }
  memory: { total: number, users: number }
}

export function buildOverview(input: OverviewInput) {
  return {
    proposals: input.proposals.map(mapProposal),
    openProposalCount: input.proposals.length,
    audit: input.audit.map(mapAuditRow),
    auditByTool: auditByTool(input.audit),
    usage: input.usage,
    memory: input.memory,
  }
}
