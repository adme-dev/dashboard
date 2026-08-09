// server/utils/crm/assignment.ts
// Auto-assignment of new CRM records to a pool of users. pickAssignee is pure
// (TDD); runAssignment does the DB I/O, using an atomic UPDATE…RETURNING for
// race-free round-robin under concurrent creates.
import { queryOne, queryRows, execute } from '~~/server/utils/db'
import type { TransactionClient } from '~~/server/utils/crm/recordAccess'

export type AssignStrategy = 'round_robin' | 'load_balanced' | 'priority' | 'single'

export interface AssignmentRule {
  strategy: AssignStrategy
  pool: string[]
  assignment_index: number
}
export interface AssignContext { loads?: Record<string, number> }
export interface AssignResult { userId: string | null, nextIndex: number }

export async function requireAssignmentPoolMembers(
  clientId: string,
  pool: readonly string[],
  database: TransactionClient
) {
  const uniqueIds = [...new Set(pool)]
  if (!uniqueIds.length) return []
  const result = await database.query(
    `SELECT member.id::text AS id
       FROM team_members member
       JOIN client_team_assignments assignment
         ON assignment.team_member_id = member.id
        AND assignment.client_id = $1
      WHERE member.id = ANY($2::uuid[])
        AND member.is_active = TRUE
      FOR SHARE OF member`,
    [clientId, uniqueIds]
  )
  const rows = (result.rows ?? []) as Array<{ id: string }>
  const authorizedIds = new Set(rows.map(row => row.id))
  if (authorizedIds.size !== uniqueIds.length
    || uniqueIds.some(id => !authorizedIds.has(id))) {
    throw createError({ statusCode: 404, statusMessage: 'Record not found' })
  }
  return rows
}

// Pure: given a rule (+ optional load map for load_balanced), pick the assignee
// and the index to store next. round_robin is the only strategy that rotates.
export function pickAssignee(rule: AssignmentRule, ctx: AssignContext = {}): AssignResult {
  const pool = rule.pool ?? []
  if (!pool.length) return { userId: null, nextIndex: rule.assignment_index }
  const first = pool[0]! // length checked above
  switch (rule.strategy) {
    case 'single':
    case 'priority':
      return { userId: first, nextIndex: rule.assignment_index }
    case 'load_balanced': {
      const loads = ctx.loads ?? {}
      let best = first
      let bestLoad = loads[first] ?? 0
      for (const u of pool) {
        const l = loads[u] ?? 0
        if (l < bestLoad) { best = u; bestLoad = l }
      }
      return { userId: best, nextIndex: rule.assignment_index }
    }
    case 'round_robin':
    default: {
      const len = pool.length
      const idx = ((rule.assignment_index % len) + len) % len // tolerate oob / negative
      return { userId: pool[idx]!, nextIndex: (idx + 1) % len }
    }
  }
}

interface DbRule { id: string, strategy: AssignStrategy, pool: unknown, assignment_index: number }

// Resolve the active assignment rule for (client, objectType) and return the
// chosen user id, or null if there's no usable rule. round_robin advances the
// stored index atomically so concurrent creates never collide on the same rep.
export async function runAssignment(clientId: string, objectType: 'person' | 'opportunity'): Promise<string | null> {
  const rule = await queryOne<DbRule>(
    `SELECT id, strategy, pool, assignment_index FROM crm_assignment_rules
      WHERE client_id = $1 AND object_type = $2 AND is_active = true
      ORDER BY created_at ASC LIMIT 1`,
    [clientId, objectType],
  )
  if (!rule) return null
  const pool: string[] = Array.isArray(rule.pool) ? rule.pool as string[] : []
  if (!pool.length) return null

  if (rule.strategy === 'round_robin') {
    // Atomic: advance the index and return the slot we just consumed.
    const r = await queryOne<{ picked: string }>(
      `UPDATE crm_assignment_rules
          SET assignment_index = (assignment_index + 1) % $2
        WHERE id = $1
        RETURNING ((assignment_index - 1 + $2) % $2)::text AS picked`,
      [rule.id, pool.length],
    )
    const idx = r ? Number(r.picked) : 0
    return pool[idx] ?? null
  }

  if (rule.strategy === 'load_balanced') {
    const rows = await queryRows<{ assigned_to: string, c: string }>(
      `SELECT assigned_to, COUNT(*)::text AS c FROM (
         SELECT assigned_to FROM crm_people        WHERE client_id = $1 AND assigned_to IS NOT NULL AND deleted_at IS NULL
         UNION ALL
         SELECT assigned_to FROM crm_opportunities WHERE client_id = $1 AND assigned_to IS NOT NULL AND deleted_at IS NULL
       ) t GROUP BY assigned_to`,
      [clientId],
    )
    const loads: Record<string, number> = {}
    for (const row of rows) loads[row.assigned_to] = Number(row.c)
    return pickAssignee({ strategy: rule.strategy, pool, assignment_index: rule.assignment_index }, { loads }).userId
  }

  // single / priority — no rotation, no extra query.
  return pickAssignee({ strategy: rule.strategy, pool, assignment_index: rule.assignment_index }).userId
}

// Called after a person/opportunity insert: if it has no owner yet, run the
// active rule and stamp owner_id (+ assigned_to). Returns the assignee, or null
// when an owner already exists or no rule applies. Best-effort at the call site.
export async function autoAssignOnCreate(opts: {
  clientId: string
  objectType: 'person' | 'opportunity'
  table: 'crm_people' | 'crm_opportunities'
  recordId: string
  currentOwner: string | null | undefined
}): Promise<string | null> {
  if (opts.currentOwner) return null
  const assignee = await runAssignment(opts.clientId, opts.objectType)
  if (!assignee) return null
  await execute(
    `UPDATE ${opts.table} SET owner_id = $1, assigned_to = COALESCE(assigned_to, $1) WHERE id = $2 AND client_id = $3`,
    [assignee, opts.recordId, opts.clientId],
  )
  return assignee
}
