/**
 * AI Command Center — Observe overview (command-center spec §4/§6).
 * GET /api/agency/ai/command-center/overview
 *
 * Read-only assembly over the Phase-0 ledgers: open proposals, the action-audit feed, 30-day
 * usage/cost, and memory stats. Management cockpit — gated to the MANAGEMENT permission group.
 */
import { requirePermission } from '~~/server/utils/auth'
import { queryRows, queryOne } from '~~/server/utils/db'
import { buildCommandCenterOverview, type ProposalRow, type AuditRow } from '~~/server/utils/ai/commandCenter'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'MANAGEMENT')

  // The four reads are independent — run them concurrently.
  const [proposals, audit, usageRow, memoryRow] = await Promise.all([
    // Open proposals awaiting confirmation (org-wide), newest first.
    queryRows<ProposalRow>(
      `SELECT p.id, p.tool_name, p.user_id, p.resolved_payload, p.created_at, p.expires_at,
              tm.name AS user_name
         FROM ai_pending_actions p
         LEFT JOIN team_members tm ON tm.id = p.user_id
        WHERE p.status = 'proposed' AND p.expires_at > NOW()
        ORDER BY p.created_at DESC
        LIMIT 50`,
    ),
    // Action audit feed (who proposed, who confirmed, outcome), newest first.
    queryRows<AuditRow>(
      `SELECT a.id, a.tool_name, a.risk_tier, a.user_id, a.confirmed_by, a.outcome,
              a.result_ref, a.client_scope, a.created_at,
              pm.name AS user_name, cm.name AS confirmer_name
         FROM ai_action_audit a
         LEFT JOIN team_members pm ON pm.id = a.user_id
         LEFT JOIN team_members cm ON cm.id = a.confirmed_by
        ORDER BY a.created_at DESC
        LIMIT 50`,
    ),
    // 30-day usage totals — aggregated in SQL (don't pull every turn).
    queryOne<{ turns: string, cost: string, tokens: string }>(
      `SELECT COUNT(*) AS turns,
              COALESCE(SUM(cost_usd), 0) AS cost,
              COALESCE(SUM(COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0)), 0) AS tokens
         FROM ai_messages
        WHERE role = 'assistant' AND created_at > NOW() - INTERVAL '30 days'`,
    ),
    queryOne<{ total: string, users: string }>(
      `SELECT COUNT(*) AS total, COUNT(DISTINCT user_id) AS users FROM ai_user_memory`,
    ),
  ])

  return buildCommandCenterOverview({
    proposals,
    audit,
    usage: {
      turns: Number(usageRow?.turns ?? 0),
      costUsd: Math.round(Number(usageRow?.cost ?? 0) * 10000) / 10000,
      tokens: Number(usageRow?.tokens ?? 0),
    },
    memory: {
      total: Number(memoryRow?.total ?? 0),
      users: Number(memoryRow?.users ?? 0),
    },
  })
})
