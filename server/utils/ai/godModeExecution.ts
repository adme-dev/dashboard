import { createHash, randomUUID } from 'node:crypto'
import type { Pool } from '@neondatabase/serverless'
import type { H3Event } from 'h3'
import { createError } from 'h3'

import { requireAuth } from '~~/server/utils/auth'
import { queryOneFresh, transaction } from '~~/server/utils/db'
import { appendGodModeAuditEvent, type GodModeAuditEventInput } from '~~/server/utils/godMode/audit'
import type { GodModeChannel } from '~~/server/utils/godMode/audit'
import {
  isActiveGodModeAuthority,
  resolveGodModeAuthority,
  type GodModeAuthority
} from '~~/server/utils/godMode/authority'
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

export interface TrustedMcpGodModeExecutionRequest extends GodModeExecutionRequest {
  /** Exact claim subject, never a body-supplied actor. */
  authenticatedUserId: string
  /** Private branded authority recovered after signed-claim consumption. */
  authority: GodModeAuthority
  /** Bounded digest from the verified exact-request claim. */
  sessionDigest: string
}

interface TrustedExecutionIdentity {
  user: { id: string, role: string, permissionGroups?: unknown[] }
  authority: GodModeAuthority
  channel: GodModeChannel
  sessionDigest: string
}

export interface GodModeToolCallClaimRequest {
  messageId: string
  ordinal: number
  toolName: string
  args: unknown
}

export interface GodModeToolCallClaim {
  claimId: string
  messageId: string
  ordinal: number
  toolName: string
  argsDigest: string
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export async function claimGodModeToolCall(request: GodModeToolCallClaimRequest): Promise<GodModeToolCallClaim> {
  const argsDigest = createHash('sha256').update(stableJson(request.args)).digest('hex')
  const claimId = randomUUID()
  const inserted = await queryOneFresh<any>(
    `INSERT INTO god_mode_tool_call_claims (id, message_id, ordinal, tool_name, args_digest)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (message_id, ordinal) DO NOTHING
     RETURNING id, message_id, ordinal, tool_name, args_digest`,
    [claimId, request.messageId, request.ordinal, request.toolName, argsDigest]
  )
  const row = inserted ?? await queryOneFresh<any>(
    `SELECT id, message_id, ordinal, tool_name, args_digest
       FROM god_mode_tool_call_claims
      WHERE message_id = $1 AND ordinal = $2`,
    [request.messageId, request.ordinal]
  )
  if (!row || row.tool_name !== request.toolName || row.args_digest !== argsDigest) {
    operationalError(409, 'Persisted tool-call identity does not match this request')
  }
  return {
    claimId: row.id,
    messageId: row.message_id,
    ordinal: row.ordinal,
    toolName: row.tool_name,
    argsDigest: row.args_digest
  }
}

export function deriveGodModeToolClaimIdempotencyKey(messageId: string, claimId: string): string {
  return `tool-claim:${createHash('sha256').update(`${messageId}\u0000${claimId}`).digest('hex')}`
}

export interface GodModeExecutionLedgerRow {
  actorUserId: string
  channel: GodModeChannel
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
  channel: GodModeChannel
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
  channel: GodModeChannel
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
    idempotencyKey: string
    conversationId?: string
    db?: TransactionDb
  }) => Promise<GodModeClaimedProposal | null>
  associateProposal: (input: {
    proposalId: string
    actorUserId: string
    idempotencyKey: string
    channel: GodModeChannel
  }) => Promise<void>
  dismissProposals: (input: { actorUserId: string, idempotencyKey: string }) => Promise<void>
  completeProposal: (input: { proposalId: string, resultReference: string, db?: TransactionDb }) => Promise<void>
  setExecutionState: (input: SetExecutionStateInput, db?: TransactionDb) => Promise<void>
  setExecutionScope?: (input: {
    actorUserId: string
    idempotencyKey: string
    channel: GodModeChannel
    tenantId: string | null
    clientId: string | null
  }) => Promise<void>
  recordExecutionProgress: (input: {
    actorUserId: string
    idempotencyKey: string
    channel: GodModeChannel
    phase: string
    resultReference?: string | null
    metadata?: Record<string, unknown>
  }) => Promise<void>
  transaction: <T>(callback: (db: TransactionDb) => Promise<T>) => Promise<T>
  enqueueTerminalAudit: (event: H3Event, terminal: GodModeAuditEventInput) => Promise<boolean>
  sessionDigest: (event: H3Event) => string
  correlationId: () => string
}

function mapLedger(row: any): GodModeExecutionLedgerRow {
  return {
    actorUserId: row.actor_user_id,
    channel: row.channel,
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
       ) VALUES ($1, $2, $3, 'in_progress', $4, $5, $6, $7, $8, $9)
       ON CONFLICT (actor_user_id, channel, idempotency_key) DO NOTHING
       RETURNING *`,
      [
        input.actorUserId, input.channel, input.idempotencyKey, input.correlationId, input.toolName,
        input.executorClass, input.tenantId ?? null, input.clientId ?? null, input.sessionDigest
      ]
    )
    if (inserted) return { claimed: true, row: mapLedger(inserted) }
    const existing = await queryOneFresh<any>(
      `SELECT * FROM god_mode_execution_ledger
        WHERE actor_user_id = $1 AND channel = $2 AND idempotency_key = $3`,
      [input.actorUserId, input.channel, input.idempotencyKey]
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
    const argTenantId = typeof args.tenantId === 'string'
      ? args.tenantId
      : typeof args.tenant_id === 'string' ? args.tenant_id : undefined
    if (input.tenantId && argTenantId && input.tenantId !== argTenantId) {
      return { ok: false, code: 'tenant_mismatch' }
    }
    const tenantId = input.tenantId ?? argTenantId
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
    if (tenantId) {
      const tenant = await queryOneFresh<{ tenant_id: string }>(
        'SELECT tenant_id FROM xero_org_connection WHERE tenant_id = $1 LIMIT 1',
        [tenantId]
      )
      if (!tenant) return { ok: false, code: 'tenant_mismatch' }
    }
    return { ok: true, tenantId: tenantId ?? null, clientId: clientId ?? null }
  },
  claimProposal: async input => await dbQueryOne<GodModeClaimedProposal>(input.db,
    `UPDATE ai_pending_actions
        SET status = 'executed', confirmed_by = $1, executed_at = NOW(), god_mode_state = 'consumed'
      WHERE id = $2 AND user_id = $1
        AND ($3::uuid IS NULL OR conversation_id = $3)
        AND source = 'god_mode_preparation' AND god_mode_execution_key = $4
        AND status = 'proposed' AND expires_at > NOW()
      RETURNING id, tool_name, resolved_payload, user_id`,
    [input.actorUserId, input.proposalId, input.conversationId ?? null, input.idempotencyKey]
  ),
  associateProposal: async input => await transaction(async db => {
    const proposal = await db.query(
      `UPDATE ai_pending_actions
          SET god_mode_state = 'associated'
        WHERE id = $1 AND user_id = $2 AND source = 'god_mode_preparation'
          AND god_mode_execution_key = $3 AND status = 'proposed' AND god_mode_state = 'preparing'`,
      [input.proposalId, input.actorUserId, input.idempotencyKey]
    )
    if ((proposal.rowCount ?? 0) !== 1) throw new Error('God mode proposal association rejected')
    const ledger = await db.query(
      `UPDATE god_mode_execution_ledger
          SET proposal_id = $4, execution_phase = 'proposal_prepared', updated_at = NOW()
        WHERE actor_user_id = $1 AND channel = $2 AND idempotency_key = $3
          AND state = 'in_progress'`,
      [input.actorUserId, input.channel, input.idempotencyKey, input.proposalId]
    )
    if ((ledger.rowCount ?? 0) !== 1) throw new Error('God mode ledger association rejected')
  }),
  dismissProposals: async input => {
    await queryOneFresh(
      `UPDATE ai_pending_actions
          SET status = 'cancelled', god_mode_state = 'dismissed'
        WHERE user_id = $1 AND source = 'god_mode_preparation'
          AND god_mode_execution_key = $2 AND status = 'proposed'
        RETURNING id`,
      [input.actorUserId, input.idempotencyKey]
    )
  },
  completeProposal: async input => {
    const result = input.db
      ? await input.db.query("UPDATE ai_pending_actions SET result_ref = $1, god_mode_state = 'completed' WHERE id = $2", [input.resultReference, input.proposalId])
      : await queryOneFresh("UPDATE ai_pending_actions SET result_ref = $1, god_mode_state = 'completed' WHERE id = $2 RETURNING id", [input.resultReference, input.proposalId])
    void result
  },
  setExecutionState: async (input, db) => {
    const sql = `UPDATE god_mode_execution_ledger
                    SET state = $4, result_reference = $5, result_digest = $6, updated_at = NOW()
                  WHERE actor_user_id = $1 AND channel = $2 AND idempotency_key = $3`
    const params = [input.actorUserId, input.channel, input.idempotencyKey, input.state, input.resultReference ?? null, input.resultDigest ?? null]
    if (db) await db.query(sql, params)
    else await queryOneFresh(`${sql} RETURNING actor_user_id`, params)
  },
  setExecutionScope: async input => {
    await queryOneFresh(
      `UPDATE god_mode_execution_ledger
          SET tenant_id = $4, client_id = $5, updated_at = NOW()
        WHERE actor_user_id = $1 AND channel = $2 AND idempotency_key = $3
          AND state = 'in_progress'
        RETURNING actor_user_id`,
      [input.actorUserId, input.channel, input.idempotencyKey, input.tenantId, input.clientId]
    )
  },
  recordExecutionProgress: async input => {
    const updated = await queryOneFresh(
      `UPDATE god_mode_execution_ledger
          SET execution_phase = $4, result_reference = COALESCE($5, result_reference),
              execution_metadata = COALESCE($6::jsonb, execution_metadata), updated_at = NOW()
        WHERE actor_user_id = $1 AND channel = $2 AND idempotency_key = $3
          AND state = 'in_progress'
        RETURNING actor_user_id`,
      [
        input.actorUserId,
        input.channel,
        input.idempotencyKey,
        input.phase,
        input.resultReference ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null
      ]
    )
    if (!updated) throw new Error('God mode execution progress rejected')
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
    channel: row.channel,
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

function createGodModeExecutionCore(deps: GodModeExecutionDependencies) {
  return async function execute(
    request: GodModeExecutionRequest,
    identity: TrustedExecutionIdentity
  ): Promise<ToolResult> {
    const { user, authority, channel, sessionDigest } = identity
    if (!authority.active || authority.actorUserId !== user.id || authority.emergencyDisabled) {
      operationalError(403, 'God mode is not active')
    }
    if (!request.idempotencyKey || request.idempotencyKey.length > 128) {
      operationalError(400, 'Invalid execution identity')
    }

    const tool = deps.resolveTool(request.toolName)
    const executor = deps.resolveExecutor(request.toolName)
    if (!tool || !executor || !tool.mutates) operationalError(404, 'God mode tool is unavailable')

    let claim: { claimed: boolean, row: GodModeExecutionLedgerRow }
    try {
      claim = await deps.claimExecution({
        actorUserId: user.id,
        channel,
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
    const auditIdentity = { ...row }

    try {
      await deps.appendAudit(auditEvent(auditIdentity, 'attempt', 'started'))
    } catch {
      await deps.setExecutionState({ actorUserId: user.id, channel, idempotencyKey: request.idempotencyKey, state: 'failed' }).catch(() => {})
      operationalError(503, 'God mode audit unavailable')
    }

    const failBeforeDispatch = async (code: string, message: string): Promise<ToolResult> => {
      try {
        await deps.dismissProposals({ actorUserId: user.id, idempotencyKey: request.idempotencyKey })
        await deps.transaction(async db => {
          await deps.appendAudit(auditEvent(auditIdentity, 'failed', code), db)
          await deps.setExecutionState({ actorUserId: user.id, channel, idempotencyKey: request.idempotencyKey, state: 'failed' }, db)
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
      source: channel === 'mcp' ? 'mcp' : 'chat',
      godModeExecutionKey: request.idempotencyKey,
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
          channel,
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
      const proposed = await tool.handler(parsed.data, { ...ctx, source: 'god_mode_preparation' })
      if (!proposed.ok) return await failBeforeDispatch('proposal_rejected', proposed.error)
      const data = proposed.data as { proposalId?: unknown }
      if (typeof data?.proposalId !== 'string') {
        await deps.transaction(async db => {
          await deps.appendAudit(auditEvent(auditIdentity, 'succeeded', 'no_mutation'), db)
          await deps.setExecutionState({ actorUserId: user.id, channel, idempotencyKey: request.idempotencyKey, state: 'succeeded' }, db)
        })
        return proposed
      }
      proposalId = data.proposalId
      await deps.associateProposal({
        proposalId,
        actorUserId: user.id,
        idempotencyKey: request.idempotencyKey,
        channel
      })
    } catch {
      return await failBeforeDispatch('handler_failed', 'Could not prepare the action.')
    }

    let capturedResultReference: string | null = null
    const executeClaimed = async (db?: TransactionDb): Promise<ExecutorResult> => {
      const proposal = await deps.claimProposal({
        proposalId,
        actorUserId: user.id,
        idempotencyKey: request.idempotencyKey,
        conversationId: request.conversationId,
        db
      })
      if (!proposal || proposal.user_id !== user.id || proposal.tool_name !== request.toolName) {
        throw Object.assign(new Error('proposal claim rejected'), {
          boundedCode: 'proposal_claim_failed',
          preDispatch: true
        })
      }
      if (!db) {
        await deps.recordExecutionProgress({
          actorUserId: user.id,
          channel,
          idempotencyKey: request.idempotencyKey,
          phase: 'dispatched'
        })
      }
      const services: ExecutionServices = {
        idempotencyKey: request.idempotencyKey,
        ...(db ? { db } : {}),
        ...(!db
          ? {
              recordProgress: async (progress: Parameters<NonNullable<ExecutionServices['recordProgress']>>[0]) => {
                await deps.recordExecutionProgress!({
                  actorUserId: user.id,
                  channel,
                  idempotencyKey: request.idempotencyKey,
                  phase: progress.phase,
                  resultReference: progress.resultReference,
                  metadata: progress.metadata
                })
              }
            }
          : {})
      }
      const result = await executor.execute(proposal.resolved_payload, ctx, services)
      capturedResultReference = result.resultRef
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
          await deps.appendAudit(auditEvent(auditIdentity, 'succeeded', 'executed'), db)
          await deps.setExecutionState({
            actorUserId: user.id,
            channel,
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
            await deps.claimProposal({
              proposalId,
              actorUserId: user.id,
              idempotencyKey: request.idempotencyKey,
              conversationId: request.conversationId,
              db
            })
            await deps.appendAudit(auditEvent(auditIdentity, 'failed', code), db)
            await deps.setExecutionState({ actorUserId: user.id, channel, idempotencyKey: request.idempotencyKey, state: 'failed' }, db)
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
      const errorResultRef = typeof (error as any)?.resultRef === 'string'
        ? String((error as any).resultRef).slice(0, 128)
        : null
      const dispatchUnknown = (error as any)?.preDispatch !== true
      if (dispatchUnknown) {
        const boundedReference = capturedResultReference ?? errorResultRef
        try {
          await deps.transaction(async db => {
            await deps.appendAudit(auditEvent(auditIdentity, 'ambiguous', 'dispatch_outcome_unknown'), db)
            await deps.setExecutionState({
              actorUserId: user.id,
              channel,
              idempotencyKey: request.idempotencyKey,
              state: 'ambiguous',
              resultReference: boundedReference
            }, db)
          })
        } catch {
          operationalError(503, 'God mode audit unavailable')
        }
        return fail('Action outcome is pending reconciliation.')
      }
      try {
        await deps.transaction(async db => {
          await deps.appendAudit(auditEvent(auditIdentity, 'failed', code), db)
          await deps.setExecutionState({ actorUserId: user.id, channel, idempotencyKey: request.idempotencyKey, state: 'failed' }, db)
        })
      } catch {
        operationalError(503, 'God mode audit unavailable')
      }
      operationalError(502, 'God mode action failed')
    }

    const terminal = auditEvent(auditIdentity, 'succeeded', 'executed')
    try {
      await deps.transaction(async db => {
        await deps.appendAudit(terminal, db)
        await deps.setExecutionState({
          actorUserId: user.id,
          channel,
          idempotencyKey: request.idempotencyKey,
          state: 'succeeded',
          resultReference: result.resultRef,
          resultDigest: resultDigest(result)
        }, db)
      })
    } catch {
      await deps.setExecutionState({
        actorUserId: user.id,
        channel,
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

export function createGodModeToolExecutor(deps: GodModeExecutionDependencies) {
  const executeCore = createGodModeExecutionCore(deps)
  return async function execute(request: GodModeExecutionRequest): Promise<ToolResult> {
    const user = await deps.requireAuth(request.event)
    const authority = await deps.resolveGodModeAuthority(request.event, user.id)
    let sessionDigest: string
    try {
      sessionDigest = deps.sessionDigest(request.event)
    } catch {
      operationalError(503, 'God mode audit unavailable')
    }
    return await executeCore(request, { user, authority, channel: 'application', sessionDigest })
  }
}

export function createTrustedMcpGodModeToolExecutor(deps: GodModeExecutionDependencies) {
  const executeCore = createGodModeExecutionCore(deps)
  return async function execute(request: TrustedMcpGodModeExecutionRequest): Promise<ToolResult> {
    if (
      request.authenticatedUserId !== request.authority.actorUserId
      || !isActiveGodModeAuthority(request.authority, request.authenticatedUserId)
      || !/^mcp:[0-9a-f]{64}$/.test(request.idempotencyKey)
      || !/^[0-9a-f]{64}$/.test(request.sessionDigest)
    ) operationalError(403, 'Invalid MCP owner execution authority')

    return await executeCore(request, {
      user: { id: request.authenticatedUserId, role: 'owner', permissionGroups: [] },
      authority: request.authority,
      channel: 'mcp',
      sessionDigest: request.sessionDigest
    })
  }
}

export const executeGodModeTool = createGodModeToolExecutor(defaultDependencies)
export const executeTrustedMcpGodModeTool = createTrustedMcpGodModeToolExecutor(defaultDependencies)

interface TrustedReadIdentity extends TrustedExecutionIdentity {
  correlationId: string
}

function mcpReadCorrelationId(idempotencyKey: string): string {
  if (!/^mcp:[0-9a-f]{64}$/.test(idempotencyKey)) operationalError(400, 'Invalid MCP execution identity')
  const hex = idempotencyKey.slice(4, 36)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

/** Reads claim their immutable attempt by correlation, but never enter the mutation execution ledger. */
async function executeGodModeReadCore(
  deps: GodModeExecutionDependencies,
  request: GodModeReadExecutionRequest,
  identity: TrustedReadIdentity
): Promise<ToolResult> {
  const { user, authority, channel, sessionDigest, correlationId } = identity
  if (!authority.active || authority.actorUserId !== user.id || authority.emergencyDisabled) {
    operationalError(403, 'God mode is not active')
  }
  const row: GodModeExecutionLedgerRow & { sessionDigest: string } = {
    actorUserId: user.id,
    channel,
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
  const auditIdentity = { ...row }
  try {
    await deps.appendAudit(auditEvent(auditIdentity, 'attempt', 'started', []))
  } catch {
    operationalError(503, 'God mode audit unavailable')
  }
  const parsed = request.tool.parameters.safeParse(request.args)
  if (!parsed.success) {
    await deps.appendAudit(auditEvent(auditIdentity, 'failed', 'schema_invalid', []))
      .catch(() => operationalError(503, 'God mode audit unavailable'))
    return fail('Invalid tool input.')
  }
  const scope = await deps.validateScope({
    actorUserId: user.id,
    tenantId: request.tenantId,
    clientId: request.clientId,
    args: parsed.data,
    ctx: request.ctx
  })
  if (scope.ok === false) {
    await deps.appendAudit(auditEvent(auditIdentity, 'failed', scope.code, []))
      .catch(() => operationalError(503, 'God mode audit unavailable'))
    return fail('Target is outside the authenticated scope.')
  }
  try {
    const result = await request.tool.handler(parsed.data, { ...request.ctx, userId: user.id, userRole: user.role })
    await deps.appendAudit(auditEvent(auditIdentity, result.ok ? 'succeeded' : 'failed', result.ok ? 'read_completed' : 'read_failed', []))
    return result
  } catch {
    try {
      await deps.appendAudit(auditEvent(auditIdentity, 'failed', 'read_failed', []))
    } catch {
      operationalError(503, 'God mode audit unavailable')
    }
    operationalError(502, 'God mode read failed')
  }
}

/** Audited in-application read path. */
export async function executeGodModeReadTool(request: GodModeReadExecutionRequest): Promise<ToolResult> {
  const user = await defaultDependencies.requireAuth(request.event)
  const authority = await defaultDependencies.resolveGodModeAuthority(request.event, user.id)
  let sessionDigest: string
  try {
    sessionDigest = defaultDependencies.sessionDigest(request.event)
  } catch {
    operationalError(503, 'God mode audit unavailable')
  }
  return await executeGodModeReadCore(defaultDependencies, request, {
    user,
    authority,
    channel: 'application',
    sessionDigest,
    correlationId: defaultDependencies.correlationId()
  })
}

export interface TrustedMcpGodModeReadRequest extends GodModeReadExecutionRequest {
  authenticatedUserId: string
  authority: GodModeAuthority
  sessionDigest: string
  idempotencyKey: string
}

export function createTrustedMcpGodModeReadExecutor(deps: GodModeExecutionDependencies) {
  return async function execute(request: TrustedMcpGodModeReadRequest): Promise<ToolResult> {
    if (
      !isActiveGodModeAuthority(request.authority, request.authenticatedUserId)
      || request.authority.actorUserId !== request.authenticatedUserId
      || !/^[0-9a-f]{64}$/.test(request.sessionDigest)
    ) operationalError(403, 'Invalid MCP owner execution authority')

    return await executeGodModeReadCore(deps, request, {
      user: { id: request.authenticatedUserId, role: 'owner', permissionGroups: [] },
      authority: request.authority,
      channel: 'mcp',
      sessionDigest: request.sessionDigest,
      correlationId: mcpReadCorrelationId(request.idempotencyKey)
    })
  }
}

export const executeTrustedMcpGodModeReadTool = createTrustedMcpGodModeReadExecutor(defaultDependencies)
