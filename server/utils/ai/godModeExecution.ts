import { createHash, randomUUID } from 'node:crypto'
import type { Pool } from '@neondatabase/serverless'
import type { H3Event } from 'h3'
import { createError } from 'h3'

import { requireAuth } from '~~/server/utils/auth'
import { queryOneFresh, transaction } from '~~/server/utils/db'
import { appendGodModeAuditEvent, type GodModeAuditEventInput } from '~~/server/utils/godMode/audit'
import { resolveGodModeAuthority } from '~~/server/utils/godMode/authority'
import { getGodModeRouteAuditState } from '~~/server/utils/godMode/featureGate'
import { sendGodModeAuditTerminal } from '~~/server/utils/queue'
import { getExecutor } from './executors'
import type { ActionExecutor, ExecutorClass, ExecutorResult, ExecutionServices } from './executors/types'
import { registry } from './tools'
import type { AiTool } from './toolRegistry'
import { fail, ok, type ToolContext, type ToolResult } from './toolContext'

type TransactionDb = Pick<Pool, 'query'>
type LedgerState = 'in_progress' | 'succeeded' | 'failed' | 'ambiguous'

export interface GodModeExecutionRequest {
  event: H3Event
  conversationId?: string
  toolName: string
  args: unknown
  idempotencyKey: string
  tenantId?: string
  clientId?: string
}

export interface GodModeReadExecutionRequest {
  event: H3Event
  tool: AiTool<any>
  args: unknown
  ctx: ToolContext
  tenantId?: string
  clientId?: string
}

export function deriveGodModeIdempotencyKey(persistedIdentity: string, toolCallId: string): string {
  const digest = createHash('sha256').update(`${persistedIdentity}\u0000${toolCallId}`).digest('hex')
  return `tool:${digest}`
}

export interface GodModeExecutionLedgerRow {
  actorUserId: string
  channel: 'application'
  idempotencyKey: string
  state: LedgerState
  correlationId: string
  routeOrTool: string
  executorClass: ExecutorClass
  tenantId: string | null
  clientId: string | null
  resultReference: string | null
  resultDigest: string | null
}

interface GodModeClaimedProposal {
  id: string
  tool_name: string
  resolved_payload: unknown
  user_id: string
}

interface ClaimExecutionInput {
  actorUserId: string
  idempotencyKey: string
  correlationId: string
  toolName: string
  executorClass: ExecutorClass
  tenantId?: string
  clientId?: string
  sessionDigest: string
}

interface SetExecutionStateInput {
  actorUserId: string
  idempotencyKey: string
  state: Exclude<LedgerState, 'in_progress'>
  resultReference?: string | null
  resultDigest?: string | null
}

export interface GodModeExecutionDependencies {
  requireAuth: typeof requireAuth
  resolveGodModeAuthority: typeof resolveGodModeAuthority
  resolveTool: (toolName: string) => AiTool<any> | null
  resolveExecutor: (toolName: string) => ActionExecutor | null
  claimExecution: (input: ClaimExecutionInput) => Promise<{ claimed: boolean, row: GodModeExecutionLedgerRow }>
  appendAudit: (input: GodModeAuditEventInput, db?: TransactionDb) => Promise<void>
  validateScope: (input: {
    actorUserId: string
    tenantId?: string
    clientId?: string
    args: unknown
    ctx: ToolContext
  }) => Promise<{ ok: true, tenantId: string | null, clientId: string | null } | { ok: false, code: 'tenant_mismatch' | 'client_mismatch' }>
  claimProposal: (input: {
    proposalId: string
    actorUserId: string
    conversationId?: string
    db?: TransactionDb
  }) => Promise<GodModeClaimedProposal | null>
  completeProposal: (input: { proposalId: string, resultReference: string, db?: TransactionDb }) => Promise<void>
  setExecutionState: (input: SetExecutionStateInput, db?: TransactionDb) => Promise<void>
  setExecutionScope?: (input: {
    actorUserId: string
    idempotencyKey: string
    tenantId: string | null
    clientId: string | null
  }) => Promise<void>
  transaction: <T>(callback: (db: TransactionDb) => Promise<T>) => Promise<T>
  enqueueTerminalAudit: (event: H3Event, terminal: GodModeAuditEventInput) => Promise<boolean>
  sessionDigest: (event: H3Event) => string
  correlationId: () => string
}

function mapLedger(row: any): GodModeExecutionLedgerRow {
  return {
    actorUserId: row.actor_user_id,
    channel: 'application',
    idempotencyKey: row.idempotency_key,
    state: row.state,
    correlationId: row.correlation_id,
    routeOrTool: row.route_or_tool,
    executorClass: row.executor_class,
    tenantId: row.tenant_id,
    clientId: row.client_id,
    resultReference: row.result_reference,
    resultDigest: row.result_digest
  }
}

async function dbQueryOne<T>(db: TransactionDb | undefined, sql: string, params: unknown[]): Promise<T | null> {
  if (db) return ((await db.query(sql, params)).rows[0] as T | undefined) ?? null
  return await queryOneFresh<T>(sql, params)
}

const defaultDependencies: GodModeExecutionDependencies = {
  requireAuth,
  resolveGodModeAuthority,
  resolveTool: toolName => registry.find(tool => tool.name === toolName) ?? null,
  resolveExecutor: getExecutor,
  claimExecution: async input => {
    const inserted = await queryOneFresh<any>(
      `INSERT INTO god_mode_execution_ledger (
         actor_user_id, channel, idempotency_key, state, correlation_id, route_or_tool,
         executor_class, tenant_id, client_id, session_digest
       ) VALUES ($1, 'application', $2, 'in_progress', $3, $4, $5, $6, $7, $8)
       ON CONFLICT (actor_user_id, channel, idempotency_key) DO NOTHING
       RETURNING *`,
      [
        input.actorUserId, input.idempotencyKey, input.correlationId, input.toolName,
        input.executorClass, input.tenantId ?? null, input.clientId ?? null, input.sessionDigest
      ]
    )
    if (inserted) return { claimed: true, row: mapLedger(inserted) }
    const existing = await queryOneFresh<any>(
      `SELECT * FROM god_mode_execution_ledger
        WHERE actor_user_id = $1 AND channel = 'application' AND idempotency_key = $2`,
      [input.actorUserId, input.idempotencyKey]
    )
    if (!existing) throw new Error('execution ledger conflict could not be resolved')
    return { claimed: false, row: mapLedger(existing) }
  },
  appendAudit: async (input, db) => await appendGodModeAuditEvent(input, db as any),
  validateScope: async input => {
    const args = input.args && typeof input.args === 'object' ? input.args as Record<string, unknown> : {}
    const argClientId = typeof args.clientId === 'string'
      ? args.clientId
      : typeof args.client_id === 'string' ? args.client_id : undefined
    if (input.clientId && argClientId && input.clientId !== argClientId) {
      return { ok: false, code: 'client_mismatch' }
    }
    const clientId = input.clientId ?? argClientId
    if (clientId) {
      const assigned = input.ctx.assistantScope?.clientAccessMode === 'assigned'
      if (assigned && !input.ctx.assistantScope?.assignedClientIds.includes(clientId)) {
        return { ok: false, code: 'client_mismatch' }
      }
      const client = await queryOneFresh<{ id: string }>(
        'SELECT id FROM agency_clients WHERE id = $1 AND is_active = TRUE LIMIT 1',
        [clientId]
      )
      if (!client) return { ok: false, code: 'client_mismatch' }
    }
    if (input.tenantId) {
      const tenant = await queryOneFresh<{ tenant_id: string }>(
        'SELECT tenant_id FROM xero_org_connection WHERE tenant_id = $1 LIMIT 1',
        [input.tenantId]
      )
      if (!tenant) return { ok: false, code: 'tenant_mismatch' }
    }
    return { ok: true, tenantId: input.tenantId ?? null, clientId: clientId ?? null }
  },
  claimProposal: async input => await dbQueryOne<GodModeClaimedProposal>(input.db,
    `UPDATE ai_pending_actions
        SET status = 'executed', confirmed_by = $1, executed_at = NOW()
      WHERE id = $2 AND user_id = $1
        AND ($3::uuid IS NULL OR conversation_id = $3)
        AND status = 'proposed' AND expires_at > NOW()
      RETURNING id, tool_name, resolved_payload, user_id`,
    [input.actorUserId, input.proposalId, input.conversationId ?? null]
  ),
  completeProposal: async input => {
    const result = input.db
      ? await input.db.query('UPDATE ai_pending_actions SET result_ref = $1 WHERE id = $2', [input.resultReference, input.proposalId])
      : await queryOneFresh('UPDATE ai_pending_actions SET result_ref = $1 WHERE id = $2 RETURNING id', [input.resultReference, input.proposalId])
    void result
  },
  setExecutionState: async (input, db) => {
    const sql = `UPDATE god_mode_execution_ledger
                    SET state = $3, result_reference = $4, result_digest = $5, updated_at = NOW()
                  WHERE actor_user_id = $1 AND channel = 'application' AND idempotency_key = $2`
    const params = [input.actorUserId, input.idempotencyKey, input.state, input.resultReference ?? null, input.resultDigest ?? null]
    if (db) await db.query(sql, params)
    else await queryOneFresh(`${sql} RETURNING actor_user_id`, params)
  },
  setExecutionScope: async input => {
    await queryOneFresh(
      `UPDATE god_mode_execution_ledger
          SET tenant_id = $3, client_id = $4, updated_at = NOW()
        WHERE actor_user_id = $1 AND channel = 'application' AND idempotency_key = $2
          AND state = 'in_progress'
        RETURNING actor_user_id`,
      [input.actorUserId, input.idempotencyKey, input.tenantId, input.clientId]
    )
  },
  transaction: callback => transaction(callback as any),
  enqueueTerminalAudit: sendGodModeAuditTerminal,
  sessionDigest: event => {
    const routeState = getGodModeRouteAuditState(event)
    if (!routeState?.sessionDigest) throw new Error('God mode route audit state unavailable')
    return routeState.sessionDigest
  },
  correlationId: randomUUID
}

function auditEvent(
  row: GodModeExecutionLedgerRow,
  phase: GodModeAuditEventInput['phase'],
  outcomeCode: string,
  bypassedControls: GodModeAuditEventInput['bypassedControls'] = ['confirmation']
): GodModeAuditEventInput {
  return {
    actorUserId: row.actorUserId,
    correlationId: row.correlationId,
    sessionDigest: (row as GodModeExecutionLedgerRow & { sessionDigest?: string }).sessionDigest ?? '0'.repeat(64),
    channel: 'application',
    routeOrTool: row.routeOrTool,
    phase,
    tenantId: row.tenantId,
    clientId: row.clientId,
    bypassedControls,
    outcomeCode,
    emergencyDisabled: false
  }
}

function resultDigest(result: ExecutorResult): string {
  return createHash('sha256').update(JSON.stringify({ resultRef: result.resultRef })).digest('hex')
}

function operationalError(statusCode: number, statusMessage: string): never {
  throw createError({ statusCode, statusMessage })
}

export function createGodModeToolExecutor(deps: GodModeExecutionDependencies) {
  return async function execute(request: GodModeExecutionRequest): Promise<ToolResult> {
    const user = await deps.requireAuth(request.event)
    const authority = await deps.resolveGodModeAuthority(request.event, user.id)
    if (!authority.active || authority.actorUserId !== user.id || authority.emergencyDisabled) {
      operationalError(403, 'God mode is not active')
    }
    if (!request.idempotencyKey || request.idempotencyKey.length > 128) {
      operationalError(400, 'Invalid execution identity')
    }

    const tool = deps.resolveTool(request.toolName)
    const executor = deps.resolveExecutor(request.toolName)
    if (!tool || !executor || !tool.mutates) operationalError(404, 'God mode tool is unavailable')

    let sessionDigest: string
    try {
      sessionDigest = deps.sessionDigest(request.event)
    } catch {
      operationalError(503, 'God mode audit unavailable')
    }
    let claim: { claimed: boolean, row: GodModeExecutionLedgerRow }
    try {
      claim = await deps.claimExecution({
        actorUserId: user.id,
        idempotencyKey: request.idempotencyKey,
        correlationId: deps.correlationId(),
        toolName: request.toolName,
        executorClass: executor.executionClass,
        tenantId: request.tenantId,
        clientId: request.clientId,
        sessionDigest
      })
    } catch {
      operationalError(503, 'God mode execution ledger unavailable')
    }
    const row = Object.assign(claim.row, { sessionDigest })
    if (!claim.claimed) {
      if (row.routeOrTool !== request.toolName) operationalError(409, 'Execution identity already used')
      if (row.state === 'succeeded') return ok({ resultRef: row.resultReference, replayed: true })
      if (row.state === 'failed') return fail('Action previously failed.')
      return fail('Action outcome is pending reconciliation.')
    }

    try {
      await deps.appendAudit(auditEvent(row, 'attempt', 'started', []))
    } catch {
      await deps.setExecutionState({ actorUserId: user.id, idempotencyKey: request.idempotencyKey, state: 'failed' }).catch(() => {})
      operationalError(503, 'God mode audit unavailable')
    }

    const failBeforeDispatch = async (code: string, message: string): Promise<ToolResult> => {
      try {
        await deps.transaction(async db => {
          await deps.appendAudit(auditEvent(row, 'failed', code), db)
          await deps.setExecutionState({ actorUserId: user.id, idempotencyKey: request.idempotencyKey, state: 'failed' }, db)
        })
      } catch {
        operationalError(503, 'God mode audit unavailable')
      }
      return fail(message)
    }

    const parsed = tool.parameters.safeParse(request.args)
    if (!parsed.success) return await failBeforeDispatch('schema_invalid', 'Invalid tool input.')

    const ctx: ToolContext = {
      userId: user.id,
      userRole: user.role,
      permissionGroups: (user.permissionGroups ?? []) as any,
      conversationId: request.conversationId,
      source: 'chat',
      event: request.event
    }
    const scope = await deps.validateScope({
      actorUserId: user.id,
      tenantId: request.tenantId,
      clientId: request.clientId,
      args: parsed.data,
      ctx
    })
    if (scope.ok === false) return await failBeforeDispatch(scope.code, 'Target is outside the authenticated scope.')
    row.tenantId = scope.tenantId
    row.clientId = scope.clientId
    if (deps.setExecutionScope) {
      try {
        await deps.setExecutionScope({
          actorUserId: user.id,
          idempotencyKey: request.idempotencyKey,
          tenantId: scope.tenantId,
          clientId: scope.clientId
        })
      } catch {
        return await failBeforeDispatch('scope_persistence_failed', 'Could not verify the target scope.')
      }
    }

    let proposalId: string
    try {
      const proposed = await tool.handler(parsed.data, ctx)
      if (!proposed.ok) return await failBeforeDispatch('proposal_rejected', proposed.error)
      const data = proposed.data as { proposalId?: unknown }
      if (typeof data?.proposalId !== 'string') {
        await deps.transaction(async db => {
          await deps.appendAudit(auditEvent(row, 'succeeded', 'no_mutation'), db)
          await deps.setExecutionState({ actorUserId: user.id, idempotencyKey: request.idempotencyKey, state: 'succeeded' }, db)
        })
        return proposed
      }
      proposalId = data.proposalId
    } catch {
      return await failBeforeDispatch('handler_failed', 'Could not prepare the action.')
    }

    const executeClaimed = async (db?: TransactionDb): Promise<ExecutorResult> => {
      const proposal = await deps.claimProposal({ proposalId, actorUserId: user.id, conversationId: request.conversationId, db })
      if (!proposal || proposal.user_id !== user.id || proposal.tool_name !== request.toolName) {
        throw Object.assign(new Error('proposal claim rejected'), { boundedCode: 'proposal_claim_failed' })
      }
      const services: ExecutionServices = { idempotencyKey: request.idempotencyKey, ...(db ? { db } : {}) }
      const result = await executor.execute(proposal.resolved_payload, ctx, services)
      if (!result.resultRef || result.resultRef.length > 128) {
        throw Object.assign(new Error('executor result reference invalid'), { boundedCode: 'executor_result_invalid' })
      }
      await deps.completeProposal({ proposalId, resultReference: result.resultRef, db })
      return result
    }

    if (executor.executionClass === 'local-transactional') {
      try {
        const result = await deps.transaction(async db => {
          const executed = await executeClaimed(db)
          await deps.appendAudit(auditEvent(row, 'succeeded', 'executed'), db)
          await deps.setExecutionState({
            actorUserId: user.id,
            idempotencyKey: request.idempotencyKey,
            state: 'succeeded',
            resultReference: executed.resultRef,
            resultDigest: resultDigest(executed)
          }, db)
          return executed
        })
        return ok({ resultRef: result.resultRef, summary: result.summary, directExecution: true })
      } catch (error) {
        const code = (error as any)?.boundedCode ?? 'executor_failed'
        try {
          await deps.transaction(async db => {
            // The failed local transaction rolled the proposal claim back with the mutation. Claim it
            // again in the failure transaction so no confirmation card can reappear.
            await deps.claimProposal({ proposalId, actorUserId: user.id, conversationId: request.conversationId, db })
            await deps.appendAudit(auditEvent(row, 'failed', code), db)
            await deps.setExecutionState({ actorUserId: user.id, idempotencyKey: request.idempotencyKey, state: 'failed' }, db)
          })
        } catch {
          operationalError(503, 'God mode audit unavailable')
        }
        return fail('God mode action failed.')
      }
    }

    let result: ExecutorResult
    try {
      result = await executeClaimed()
    } catch (error) {
      const code = (error as any)?.boundedCode ?? 'executor_failed'
      try {
        await deps.transaction(async db => {
          await deps.appendAudit(auditEvent(row, 'failed', code), db)
          await deps.setExecutionState({ actorUserId: user.id, idempotencyKey: request.idempotencyKey, state: 'failed' }, db)
        })
      } catch {
        operationalError(503, 'God mode audit unavailable')
      }
      operationalError(502, 'God mode action failed')
    }

    const terminal = auditEvent(row, 'succeeded', 'executed')
    try {
      await deps.transaction(async db => {
        await deps.appendAudit(terminal, db)
        await deps.setExecutionState({
          actorUserId: user.id,
          idempotencyKey: request.idempotencyKey,
          state: 'succeeded',
          resultReference: result.resultRef,
          resultDigest: resultDigest(result)
        }, db)
      })
    } catch {
      await deps.setExecutionState({
        actorUserId: user.id,
        idempotencyKey: request.idempotencyKey,
        state: 'ambiguous',
        resultReference: result.resultRef,
        resultDigest: resultDigest(result)
      }).catch(() => {})
      await deps.enqueueTerminalAudit(request.event, terminal).catch(() => false)
      return fail('Action outcome is pending reconciliation.')
    }
    return ok({ resultRef: result.resultRef, summary: result.summary, directExecution: true })
  }
}

export const executeGodModeTool = createGodModeToolExecutor(defaultDependencies)

/** Audited read path. Reads do not enter the mutation ledger and never dispatch a reconciliation job. */
export async function executeGodModeReadTool(request: GodModeReadExecutionRequest): Promise<ToolResult> {
  const user = await defaultDependencies.requireAuth(request.event)
  const authority = await defaultDependencies.resolveGodModeAuthority(request.event, user.id)
  if (!authority.active || authority.actorUserId !== user.id || authority.emergencyDisabled) {
    operationalError(403, 'God mode is not active')
  }
  const correlationId = defaultDependencies.correlationId()
  let sessionDigest: string
  try {
    sessionDigest = defaultDependencies.sessionDigest(request.event)
  } catch {
    operationalError(503, 'God mode audit unavailable')
  }
  const row: GodModeExecutionLedgerRow & { sessionDigest: string } = {
    actorUserId: user.id,
    channel: 'application',
    idempotencyKey: 'read',
    state: 'in_progress',
    correlationId,
    routeOrTool: request.tool.name,
    executorClass: 'internal-http',
    tenantId: request.tenantId ?? null,
    clientId: request.clientId ?? null,
    resultReference: null,
    resultDigest: null,
    sessionDigest
  }
  try {
    await defaultDependencies.appendAudit(auditEvent(row, 'attempt', 'started', []))
  } catch {
    operationalError(503, 'God mode audit unavailable')
  }
  const parsed = request.tool.parameters.safeParse(request.args)
  if (!parsed.success) {
    await defaultDependencies.appendAudit(auditEvent(row, 'failed', 'schema_invalid', []))
      .catch(() => operationalError(503, 'God mode audit unavailable'))
    return fail('Invalid tool input.')
  }
  const scope = await defaultDependencies.validateScope({
    actorUserId: user.id,
    tenantId: request.tenantId,
    clientId: request.clientId,
    args: parsed.data,
    ctx: request.ctx
  })
  if (scope.ok === false) {
    await defaultDependencies.appendAudit(auditEvent(row, 'failed', scope.code, []))
      .catch(() => operationalError(503, 'God mode audit unavailable'))
    return fail('Target is outside the authenticated scope.')
  }
  row.tenantId = scope.tenantId
  row.clientId = scope.clientId
  try {
    const result = await request.tool.handler(parsed.data, { ...request.ctx, userId: user.id, userRole: user.role })
    await defaultDependencies.appendAudit(auditEvent(row, result.ok ? 'succeeded' : 'failed', result.ok ? 'read_completed' : 'read_failed', []))
    return result
  } catch {
    try {
      await defaultDependencies.appendAudit(auditEvent(row, 'failed', 'read_failed', []))
    } catch {
      operationalError(503, 'God mode audit unavailable')
    }
    operationalError(502, 'God mode read failed')
  }
}
