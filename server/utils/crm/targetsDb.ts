// server/utils/crm/targetsDb.ts
// F15 — sales-target persistence + the attainment leaderboard query.
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { leaderboard, type CrmTargetType, type AttainmentRow } from '~~/server/utils/crm/analytics'
import type { CrmSearchContext } from '~~/server/utils/crm/searchContext'
import { buildWhere, visibilityCondsForContext } from '~~/server/utils/crm/queryScope'

export interface TargetRow {
  id: string
  client_id: string
  user_id: string
  user_name?: string | null
  period_start: string
  period_end: string
  target_type: CrmTargetType
  target_value: number
  created_at: string
}

type TargetDbDependencies = { queryRows: typeof queryRows }
const defaultTargetDbDependencies: TargetDbDependencies = { queryRows }

function ownerScoped(scope: string | CrmSearchContext): scope is CrmSearchContext {
  return typeof scope !== 'string' && scope.actorType === 'staff' && scope.visibility.ownerScoped
}

export async function listTargets(
  scope: string | CrmSearchContext,
  period?: { start: string, end: string },
  deps: TargetDbDependencies = defaultTargetDbDependencies
): Promise<TargetRow[]> {
  const clientId = typeof scope === 'string' ? scope : scope.clientId
  const conds = ['t.client_id = $1']
  const params: unknown[] = [clientId]
  if (ownerScoped(scope)) { params.push(scope.actorId); conds.push(`t.user_id = $${params.length}`) }
  if (period) {
    params.push(period.start); conds.push(`t.period_start = $${params.length}`)
    params.push(period.end); conds.push(`t.period_end = $${params.length}`)
  }
  return await deps.queryRows<TargetRow>(
    `SELECT t.*, u.name AS user_name
       FROM crm_sales_targets t
       LEFT JOIN team_members u ON u.id = t.user_id
      WHERE ${conds.join(' AND ')}
      ORDER BY t.period_start DESC, u.name ASC`,
    params,
  )
}

export async function upsertTarget(input: {
  clientId: string, userId: string, periodStart: string, periodEnd: string,
  targetType: CrmTargetType, targetValue: number, createdBy?: string | null,
}): Promise<TargetRow> {
  const row = await queryOne<TargetRow>(
    `INSERT INTO crm_sales_targets (client_id, user_id, period_start, period_end, target_type, target_value, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (client_id, user_id, period_start, period_end, target_type)
       DO UPDATE SET target_value = EXCLUDED.target_value, updated_at = now()
     RETURNING *`,
    [input.clientId, input.userId, input.periodStart, input.periodEnd, input.targetType, input.targetValue, input.createdBy ?? null],
  )
  if (!row) throw createError({ statusCode: 500, statusMessage: 'Failed to save target' })
  return row
}

export async function deleteTarget(id: string, clientId: string): Promise<boolean> {
  const n = await execute(`DELETE FROM crm_sales_targets WHERE id = $1 AND client_id = $2`, [id, clientId])
  return n > 0
}

export type LeaderboardRow = AttainmentRow & { user_name: string | null }

/** Targets for the window + won deals closed in it → ranked attainment rows with names. */
export async function getLeaderboard(
  scope: string | CrmSearchContext,
  periodStart: string,
  periodEnd: string,
  deps: TargetDbDependencies = defaultTargetDbDependencies
): Promise<LeaderboardRow[]> {
  const clientId = typeof scope === 'string' ? scope : scope.clientId
  const targets = await listTargets(scope, { start: periodStart, end: periodEnd }, deps)
  const { where, params } = buildWhere(clientId, [
    ...(typeof scope === 'string' ? [] : visibilityCondsForContext(scope, 'opportunity', 'crm_opportunities')),
    { sql: "crm_opportunities.status = ?", params: ['won'] },
    { sql: 'crm_opportunities.actual_close_date >= ?', params: [periodStart] },
    { sql: 'crm_opportunities.actual_close_date <= ?', params: [periodEnd] }
  ])
  const wonOpps = await deps.queryRows<{ owner_id: string | null, amount: number }>(
    `SELECT owner_id, amount FROM crm_opportunities ${where}`,
    params,
  )
  const rows = leaderboard(
    targets.map(t => ({ user_id: t.user_id, target_type: t.target_type, target_value: Number(t.target_value) })),
    wonOpps.map(o => ({ owner_id: o.owner_id, amount: Number(o.amount) })),
  )
  // Attach display names.
  const nameById = new Map(targets.map(t => [t.user_id, t.user_name ?? null]))
  return rows.map(r => ({ ...r, user_name: nameById.get(r.user_id) ?? null }))
}
