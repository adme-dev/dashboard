import { z } from 'zod'
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'
import { queryOne, queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { buildDataHealth, paginateWithCursor } from './responseContract'

const params = z.object({
  type: z.string().optional(),
  severity: z.enum(['critical', 'warning', 'info']).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
})
type Args = z.infer<typeof params>

/** Statuses that are NOT open — handlers must exclude these to return live incidents only. */
const CLOSED_STATUSES = ['resolved', 'dismissed'] as const

/** Raw row shape the deps return — only the columns we project. */
type AnomalyRecord = { fingerprint?: string, type: string, severity: string, title: string, description: string, recommendation?: string | null, metric?: unknown, comparison?: unknown, context?: unknown }

/** What the handler asks the data source for. `excludeStatuses` proves it requests open-only. */
export type AnomalyQuery = {
  excludeStatuses: readonly string[]
  type?: string
  severity?: 'critical' | 'warning' | 'info'
}

export type AnomaliesDeps = {
  fetchAnomalies: (q: AnomalyQuery, ctx: ToolContext) => Promise<AnomalyRecord[]>
  isConfigured?: (ctx: ToolContext) => Promise<boolean>
}

export async function resolveAnomalyTenant(
  ctx: ToolContext,
  selected: typeof getSelectedTenant = getSelectedTenant,
  load: typeof queryOne = queryOne,
): Promise<string | undefined> {
  const tenantId = await selected(ctx.event)
  if (tenantId) return tenantId
  if (ctx.source !== 'mcp') return undefined

  // OAuth transport requests do not carry the browser's selected-tenant cookie.
  // If the Xero connection has since been removed, retain read-only access to
  // the most recently detected tenant instead of misreporting the code-defined
  // anomaly engine as unconfigured. Never accept a tenant from model input.
  const latest = await load<{ tenant_id: string }>(
    `SELECT tenant_id
       FROM anomalies
      WHERE tenant_id <> '__default__'
      ORDER BY first_detected_at DESC
      LIMIT 1`,
  )
  return latest?.tenant_id
}

// Real wiring: read directly from the `anomalies` table (`server/api/ai/anomalies/index.get.ts`
// is the precedent). Tenant scoping comes from the selected Xero org on the event — never from
// model-supplied input. WHERE status NOT IN ('resolved','dismissed') = the "open incidents" set.
/**
 * Source-side cap. We fetch one extra row so the tool can DECLARE truncation (P-03) instead of
 * reporting the cap as the total.
 */
export const ANOMALY_FETCH_CAP = 100

const defaultDeps: AnomaliesDeps = {
  fetchAnomalies: async (q, ctx) => {
    const tenantId = await resolveAnomalyTenant(ctx)
    if (!tenantId) return []

    const where: string[] = ['tenant_id = $1', 'status <> ALL($2)']
    const sqlParams: any[] = [tenantId, q.excludeStatuses]
    let i = 3
    if (q.type) { where.push(`type = $${i++}`); sqlParams.push(q.type) }
    if (q.severity) { where.push(`severity = $${i++}`); sqlParams.push(q.severity) }

    return queryRows<AnomalyRecord>(
      `SELECT fingerprint, type, severity, title, description, recommendation, metric, comparison, context FROM anomalies
       WHERE ${where.join(' AND ')}
       ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 WHEN 'info' THEN 2 ELSE 3 END,
                first_detected_at DESC
       LIMIT ${ANOMALY_FETCH_CAP + 1}`,
      sqlParams,
    )
  },
  isConfigured: async (ctx) => {
    const tenantId = await resolveAnomalyTenant(ctx)
    // Detection rules are code-defined and active for every selected tenant. An empty
    // anomalies table therefore means "configured and healthy", not "not configured".
    return Boolean(tenantId)
  },
}

export async function getOpenAnomalies(args: Args, ctx: ToolContext, deps: AnomaliesDeps = defaultDeps): Promise<ToolResult> {
  try {
    const rows = await deps.fetchAnomalies(
      { excludeStatuses: CLOSED_STATUSES, type: args.type, severity: args.severity },
      ctx,
    )
    const truncatedAtSource = rows.length > ANOMALY_FETCH_CAP
    const bounded = truncatedAtSource ? rows.slice(0, ANOMALY_FETCH_CAP) : rows
    const compact = bounded.map(r => ({
      type: r.type,
      rule: r.fingerprint ?? r.type,
      severity: r.severity,
      title: r.title,
      context: r.description,
      recommendation: r.recommendation ?? null,
      evidence: { metric: r.metric ?? null, comparison: r.comparison ?? null, context: r.context ?? null },
    }))
    const page = paginateWithCursor(compact, args.cursor, args.limit, { truncatedAtSource })
    const configured = rows.length > 0 || (deps.isConfigured ? await deps.isConfigured(ctx) : true)
    return ok({
      ...buildDataHealth({ configured, expected: 1, withData: configured ? 1 : 0 }),
      coverageField: 'anomaly_engine_readiness',
      anomalies: page.items,
      total: page.total,
      appliedLimit: args.limit ?? 20,
      nextCursor: page.nextCursor,
      more: page.more,
      truncatedAtSource: page.truncatedAtSource,
      sourceCap: ANOMALY_FETCH_CAP,
    })
  } catch {
    return fail('Could not load open anomalies — the anomaly data may be unavailable or no organisation is selected.')
  }
}

export const anomaliesTool: AiTool<Args> = {
  name: 'get_open_anomalies',
  description: 'List currently open anomaly detections with rule, severity, recommendation and evidence values. MCP requests resolve the server-held organisation context without relying on a browser cookie; if Xero is disconnected, the latest detected non-default tenant remains available read-only. An empty result explicitly distinguishes a configured healthy engine from one that has never produced data. Filter by type/severity and paginate with cursor.',
  parameters: params,
  requiredPermission: 'FINANCE',
  returnsUntrusted: true,
  handler: (a, c) => getOpenAnomalies(a, c),
}
