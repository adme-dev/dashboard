import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { transaction, queryRowsFresh } from '~~/server/utils/db'
import { requireMarketingDepartment } from './departmentAuthority'
import { resolveMarketingReadScope, requireScopedClient } from './readScope'
import { fail, ok, type ToolContext, type ToolResult } from '../toolContext'
import { departmentBudgetListSchema, departmentBudgetUpdateSchema } from './departmentBudgetSchemas'

const toolName = 'marketing_set_budget_allocations'
export async function listDepartmentBudgetAllocations(raw: unknown, ctx: ToolContext): Promise<ToolResult> {
  const args = departmentBudgetListSchema.parse(raw)

  const fresh = await requireMarketingDepartment(ctx)

  await requireScopedClient(await resolveMarketingReadScope(fresh), args.clientId)

  const rows = await queryRowsFresh<{
    id: string
  }>(`
    SELECT m.id, m.client_id, m.platform, m.period, m.budget_allocated,
           m.budget_rolling, m.actual_spend, m.updated_at
      FROM media_spend m JOIN agency_clients c ON c.id = m.client_id AND c.is_active = TRUE
     WHERE m.client_id = $1 AND m.period = $2 AND ($3::uuid IS NULL OR m.id > $3::uuid)
     ORDER BY m.id LIMIT $4`, [args.clientId, args.period, args.afterId ?? null, args.limit + 1])

  const items = rows.slice(0, args.limit)

  return ok({ items, nextCursor: rows.length > args.limit ? items.at(-1)?.id : null, storedOnly: true, providerChanged: false })
}
/** Recorded allocations only. Live campaign budget changes retain the reviewed provider plan path. */
export async function setDepartmentBudgetAllocations(raw: unknown, ctx: ToolContext, idempotencyKey: string, sessionDigest: string, existingTransaction?: Parameters<Parameters<typeof transaction>[0]>[0]): Promise<ToolResult> {
  try {
    const args = departmentBudgetUpdateSchema.parse(raw)

    if (!/^mcp:[0-9a-f]{64}$/.test(idempotencyKey) || !/^[0-9a-f]{64}$/.test(sessionDigest))
      return fail('Invalid execution identity', 'bad_args')

    const fresh = await requireMarketingDepartment(ctx, true)

    await requireScopedClient(await resolveMarketingReadScope(fresh), args.clientId)

    // Parse strips no keys (strict schema) and gives a stable field order; sort records for exact replay.
    args.changes.sort((a, b) => a.spendId.localeCompare(b.spendId))

    const reference = `department-budget:${createHash('sha256').update(JSON.stringify(args)).digest('hex')}`

    const transact: typeof transaction = existingTransaction ? async fn => fn(existingTransaction) : transaction

    return await transact(async (db) => {
      const inserted = await db.query(`INSERT INTO god_mode_execution_ledger (
        actor_user_id, channel, idempotency_key, state, correlation_id, route_or_tool,
        executor_class, session_digest, execution_phase, client_id, result_reference
      ) VALUES ($1, 'mcp', $2, 'in_progress', $3, $4, 'local-transactional', $5, 'claimed', $6, $7)
      ON CONFLICT (actor_user_id, channel, idempotency_key) DO NOTHING RETURNING state`, [fresh.userId, idempotencyKey, randomUUID(), toolName, sessionDigest, args.clientId, reference])

      if (!inserted.rows.length) {
        const previous = (await db.query(`SELECT state, route_or_tool, result_reference FROM god_mode_execution_ledger
          WHERE actor_user_id = $1 AND channel = 'mcp' AND idempotency_key = $2 FOR UPDATE`, [fresh.userId, idempotencyKey])).rows[0]

        if (!previous || previous.route_or_tool !== toolName || previous.result_reference !== reference)
          return fail('Execution identity already used for different input', 'conflict')

        return previous.state === 'succeeded'
          ? ok({ alreadyApplied: true, replayed: true, clientId: args.clientId, providerChanged: false })
          : fail('Execution outcome requires reconciliation', 'pending')
      }

      const ids = args.changes.map(change => change.spendId)

      const rows = (await db.query(`SELECT m.id, m.client_id, m.budget_allocated, m.budget_rolling
        FROM media_spend m JOIN agency_clients c ON c.id = m.client_id
        WHERE m.id = ANY($1::uuid[]) AND m.client_id = $2 AND c.is_active = TRUE
        ORDER BY m.id FOR UPDATE OF m, c`, [ids, args.clientId])).rows

      const refused = (message: string, code: string): never => {
        throw Object.assign(new Error(message), { departmentResult: fail(message, code) })
      }

      if (rows.length !== ids.length || rows.some(row => row.client_id !== args.clientId || !ids.includes(row.id)))
        refused('One or more active-client spend records are unavailable', 'forbidden')

      const byId = new Map(rows.map(row => [row.id, row]))

      for (const change of args.changes) {
        if (Math.round(Number(byId.get(change.spendId)?.budget_allocated) * 100) !== Math.round(change.expectedBudget * 100))
          refused('Budget changed since it was read; reload before applying', 'conflict')
      }

      for (const change of args.changes) {
        const updated = await db.query(`UPDATE media_spend SET budget_allocated = $3, budget_rolling = $4, updated_at = NOW()
          WHERE id = $1 AND client_id = $2`, [change.spendId, args.clientId, change.budget, change.rolling])

        if (updated.rowCount !== 1)
          throw new Error('Budget update rejected')

        await db.query(`INSERT INTO budget_audit_log (media_spend_id, previous_budget, new_budget, changed_by, note)
          VALUES ($1, $2, $3, $4, $5)`, [change.spendId, change.expectedBudget, change.budget, fresh.userId,
          `${args.note} [rolling: ${byId.get(change.spendId)?.budget_rolling === true} -> ${change.rolling}]`])
      }

      const completed = await db.query(`UPDATE god_mode_execution_ledger SET state = 'succeeded', execution_phase = 'result_captured',
        result_digest = $3, updated_at = NOW() WHERE actor_user_id = $1 AND channel = 'mcp' AND idempotency_key = $2 AND state = 'in_progress'`, [fresh.userId, idempotencyKey, reference.slice('department-budget:'.length)])

      if (completed.rowCount !== 1)
        throw new Error('Budget completion rejected')

      return ok({ clientId: args.clientId, updated: ids.length, providerChanged: false })
    })
  } catch (error) {
    if (error instanceof z.ZodError)
      return fail('Invalid budget allocation input', 'bad_args')

    const refusal = (error as {
      departmentResult?: ToolResult
    }).departmentResult

    return refusal ?? fail('Budget allocations could not be updated', 'unavailable')
  }
}
