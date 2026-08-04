import { z } from 'zod'
import { createHash, randomUUID } from 'node:crypto'
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'
import { upsertMemory } from '../memory/store'
import { indexMemoryVector } from '../memory/embed'
import type { UpsertMemoryInput } from '../memory/types'
import { transaction as dbTransaction } from '~~/server/utils/db'

const params = z.object({
  content: z.string().min(1),
  memType: z.enum(['semantic', 'episodic', 'procedural']).default('semantic'),
})
type Args = z.infer<typeof params>

export type RememberDeps = {
  save: (input: UpsertMemoryInput, ctx: ToolContext) => Promise<string>
  /** Derived Vectorize side effect; omitted inside DB transactions and scheduled only by normal use. */
  index?: (input: { event: ToolContext['event'], id: string, userId: string, scope: 'user', memType: Args['memType'], content: string }) => Promise<unknown>
}

const defaultDeps: RememberDeps = {
  save: input => upsertMemory(input),
  index: async input => await indexMemoryVector(input)
}

/**
 * Explicit memory capture. This is an immediate local mutation: personal memory is private +
 * low-risk, so ordinary in-app use writes directly without a confirm card, while MCP/God mode route
 * it through the durable local-transaction coordinator. The user explicitly asked to be
 * remembered. Always scoped to ctx.userId; never another user. Explicit memories get higher salience
 * than inferred ones (0.7 vs 0.5) since the user opted in. (Vector indexing for recall is handled by
 * the memory orchestration; even un-embedded rows surface via the recency fallback.)
 */
export async function remember(args: Args, ctx: ToolContext, deps: RememberDeps = defaultDeps): Promise<ToolResult> {
  const content = args.content.trim()
  if (!content) return fail('There is nothing to remember.')

  let id: string
  try {
    id = await deps.save(
      { userId: ctx.userId, memType: args.memType, content, source: 'explicit', salience: 0.7 },
      ctx,
    )
  } catch {
    // Fail-safe like every other tool: a transient DB error returns a recoverable message the model
    // can relay, instead of propagating and breaking the whole turn.
    return fail('I could not save that just now — please try again in a moment.')
  }

  // Index for vector recall (best-effort, fully fail-safe inside indexMemoryVector). Without it an
  // explicit memory is recall-able only via the recency fallback.
  if (deps.index) {
    void deps.index({ event: ctx.event, id, userId: ctx.userId, scope: 'user', memType: args.memType, content })
      .catch(() => {})
  }

  return ok({ remembered: true, id, content })
}

export const rememberTool: AiTool<Args> = {
  name: 'remember',
  description: 'Save a durable personal note about the user or how they like to work, so you recall it in future conversations (e.g. "I report Acme in AUD", "I prefer ROAS over CPA"). Use when the user asks you to remember something, or states a stable preference worth keeping. memType: semantic (a fact/preference, default), episodic (something that happened), procedural (a routine they follow). This saves a PRIVATE note for this user only — it is not shared and is not the agency knowledge base.',
  parameters: params,
  mutates: true,
  directMutation: {
    executionClass: 'local-transactional',
    execute: async (args, ctx, db) => await remember(args, ctx, {
      save: async input => await upsertMemory(input, {
        queryOne: async <T>(sql: string, params?: unknown[]) => ((await db.query(sql, params)).rows[0] as T | undefined) ?? null,
        queryRows: async <T>(sql: string, params?: unknown[]) => (await db.query(sql, params)).rows as T[],
        execute: async (sql: string, params?: unknown[]) => (await db.query(sql, params)).rowCount ?? 0
      })
    })
  },
  handler: (a, c) => remember(a, c),
}

type RememberTransactionDb = { query: (sql: string, params?: unknown[]) => Promise<any> }

export interface OrdinaryMcpRememberRequest {
  userId: string
  idempotencyKey: string
  sessionDigest: string
  args: unknown
  ctx: ToolContext
}

interface OrdinaryMcpRememberLedgerRow {
  state: 'in_progress' | 'succeeded' | 'failed' | 'ambiguous'
  routeOrTool: string
  resultReference: string | null
}

export interface OrdinaryMcpRememberDependencies {
  transaction: <T>(callback: (db: RememberTransactionDb) => Promise<T>) => Promise<T>
  claim: (
    request: OrdinaryMcpRememberRequest,
    db: RememberTransactionDb
  ) => Promise<{ claimed: boolean, row: OrdinaryMcpRememberLedgerRow }>
  executeMutation: (args: Args, ctx: ToolContext, db: RememberTransactionDb) => Promise<ToolResult>
  appendAudit: (
    request: OrdinaryMcpRememberRequest,
    resultReference: string,
    db: RememberTransactionDb
  ) => Promise<void>
  complete: (
    request: OrdinaryMcpRememberRequest,
    identity: { resultReference: string, resultDigest: string },
    db: RememberTransactionDb
  ) => Promise<void>
}

function ordinaryRememberIdentity(result: ToolResult): { resultReference: string, resultDigest: string } {
  const digest = createHash('sha256').update(JSON.stringify(result)).digest('hex')
  const id = result.ok && result.data && typeof result.data === 'object'
    ? (result.data as { id?: unknown }).id
    : null
  return {
    resultReference: typeof id === 'string' && id.length > 0 ? id.slice(0, 128) : `mcp-result:${digest.slice(0, 64)}`,
    resultDigest: digest
  }
}

const ordinaryMcpRememberDependencies: OrdinaryMcpRememberDependencies = {
  transaction: async callback => await dbTransaction(callback as any),
  claim: async (request, db) => {
    const inserted = (await db.query(
      `INSERT INTO god_mode_execution_ledger (
         actor_user_id, channel, idempotency_key, state, correlation_id, route_or_tool,
         executor_class, session_digest, execution_phase
       ) VALUES ($1, 'mcp', $2, 'in_progress', $3, 'remember', 'local-transactional', $4, 'claimed')
       ON CONFLICT (actor_user_id, channel, idempotency_key) DO NOTHING
       RETURNING state, route_or_tool, result_reference`,
      [request.userId, request.idempotencyKey, randomUUID(), request.sessionDigest]
    )).rows[0]
    if (inserted) {
      return {
        claimed: true,
        row: { state: inserted.state, routeOrTool: inserted.route_or_tool, resultReference: inserted.result_reference }
      }
    }
    const existing = (await db.query(
      `SELECT state, route_or_tool, result_reference
         FROM god_mode_execution_ledger
        WHERE actor_user_id = $1 AND channel = 'mcp' AND idempotency_key = $2
        FOR UPDATE`,
      [request.userId, request.idempotencyKey]
    )).rows[0]
    if (!existing) throw new Error('MCP remember execution claim unavailable')
    return {
      claimed: false,
      row: { state: existing.state, routeOrTool: existing.route_or_tool, resultReference: existing.result_reference }
    }
  },
  executeMutation: async (args, ctx, db) => await rememberTool.directMutation!.execute(args, ctx, db),
  appendAudit: async (request, resultReference, db) => {
    await db.query(
      `INSERT INTO ai_action_audit
        (pending_id, user_id, confirmed_by, tool_name, risk_tier, client_scope, payload, result_ref, outcome)
       VALUES (NULL, $1, NULL, 'remember', 'auto', NULL, $2::jsonb, $3, 'executed')`,
      [
        request.userId,
        JSON.stringify({ source: 'mcp', argKeys: Object.keys(request.args as Record<string, unknown>), idempotencyKey: request.idempotencyKey }),
        resultReference
      ]
    )
  },
  complete: async (request, identity, db) => {
    const updated = await db.query(
      `UPDATE god_mode_execution_ledger
          SET state = 'succeeded', execution_phase = 'result_captured',
              result_reference = $3, result_digest = $4, updated_at = NOW()
        WHERE actor_user_id = $1 AND channel = 'mcp' AND idempotency_key = $2
          AND state = 'in_progress'`,
      [request.userId, request.idempotencyKey, identity.resultReference, identity.resultDigest]
    )
    if ((updated.rowCount ?? 0) !== 1) throw new Error('MCP remember execution completion rejected')
  }
}

/** Ordinary MCP's immediate memory write; claim, memory, audit, and terminal state share one DB transaction. */
export async function executeOrdinaryMcpRememberMutation(
  request: OrdinaryMcpRememberRequest,
  deps: OrdinaryMcpRememberDependencies = ordinaryMcpRememberDependencies
): Promise<ToolResult> {
  if (
    !request.userId
    || !/^mcp:[0-9a-f]{64}$/.test(request.idempotencyKey)
    || !/^[0-9a-f]{64}$/.test(request.sessionDigest)
  ) return fail('Invalid MCP remember execution identity.')

  const parsed = params.safeParse(request.args)
  if (!parsed.success) return fail('Invalid arguments.')

  try {
    return await deps.transaction(async db => {
      const claim = await deps.claim(request, db)
      if (claim.row.routeOrTool !== 'remember') return fail('Execution identity already used.')
      if (!claim.claimed) {
        if (claim.row.state === 'succeeded') {
          return ok({ resultRef: claim.row.resultReference, replayed: true })
        }
        if (claim.row.state === 'failed') return fail('Action previously failed.')
        return fail('Action outcome is pending reconciliation.')
      }

      const result = await deps.executeMutation(parsed.data, { ...request.ctx, source: 'mcp' }, db)
      if (!result.ok) throw new Error('MCP remember mutation failed')
      const identity = ordinaryRememberIdentity(result)
      await deps.appendAudit(request, identity.resultReference, db)
      await deps.complete(request, identity, db)
      return result
    })
  } catch {
    return fail('I could not save that just now — please try again in a moment.')
  }
}
