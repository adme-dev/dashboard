import { z } from 'zod'
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'
import { queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'

const params = z.object({
  type: z.string().optional(),
  severity: z.enum(['critical', 'warning', 'info']).optional(),
})
type Args = z.infer<typeof params>

/** Statuses that are NOT open — handlers must exclude these to return live incidents only. */
const CLOSED_STATUSES = ['resolved', 'dismissed'] as const

/** Raw row shape the deps return — only the columns we project. */
type AnomalyRecord = { type: string, severity: string, title: string, description: string }

/** What the handler asks the data source for. `excludeStatuses` proves it requests open-only. */
export type AnomalyQuery = {
  excludeStatuses: readonly string[]
  type?: string
  severity?: 'critical' | 'warning' | 'info'
}

export type AnomaliesDeps = {
  fetchAnomalies: (q: AnomalyQuery, ctx: ToolContext) => Promise<AnomalyRecord[]>
}

// Real wiring: read directly from the `anomalies` table (`server/api/ai/anomalies/index.get.ts`
// is the precedent). Tenant scoping comes from the selected Xero org on the event — never from
// model-supplied input. WHERE status NOT IN ('resolved','dismissed') = the "open incidents" set.
const defaultDeps: AnomaliesDeps = {
  fetchAnomalies: async (q, ctx) => {
    const tenantId = await getSelectedTenant(ctx.event)
    if (!tenantId) return []

    const where: string[] = ['tenant_id = $1', 'status <> ALL($2)']
    const sqlParams: any[] = [tenantId, q.excludeStatuses]
    let i = 3
    if (q.type) { where.push(`type = $${i++}`); sqlParams.push(q.type) }
    if (q.severity) { where.push(`severity = $${i++}`); sqlParams.push(q.severity) }

    return queryRows<AnomalyRecord>(
      `SELECT type, severity, title, description FROM anomalies
       WHERE ${where.join(' AND ')}
       ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 WHEN 'info' THEN 2 ELSE 3 END,
                first_detected_at DESC
       LIMIT 100`,
      sqlParams,
    )
  },
}

const CAP = 20

export async function getOpenAnomalies(args: Args, ctx: ToolContext, deps: AnomaliesDeps = defaultDeps): Promise<ToolResult> {
  try {
    const rows = await deps.fetchAnomalies(
      { excludeStatuses: CLOSED_STATUSES, type: args.type, severity: args.severity },
      ctx,
    )
    const compact = rows.map(r => ({
      type: r.type,
      severity: r.severity,
      title: r.title,
      context: r.description,
    }))
    return ok({
      anomalies: compact.slice(0, CAP),
      more: Math.max(0, compact.length - CAP),
    })
  } catch {
    return fail('Could not load open anomalies — the anomaly data may be unavailable or no organisation is selected.')
  }
}

export const anomaliesTool: AiTool<Args> = {
  name: 'get_open_anomalies',
  description: 'List the agency’s currently OPEN financial/operational anomalies (incidents the detection engine flagged but nobody has resolved or dismissed). Each item is { type, severity, title, context }. Use for "what’s wrong / any alerts / what needs attention / show me critical issues". Filter by type (e.g. expenses, cashflow, adspend) and/or severity (critical|warning|info). Do NOT use for raw cashflow numbers (use get_finance_snapshot) — this returns flagged problems, not metrics.',
  parameters: params,
  requiredPermission: 'FINANCE',
  returnsUntrusted: true,
  handler: (a, c) => getOpenAnomalies(a, c),
}
