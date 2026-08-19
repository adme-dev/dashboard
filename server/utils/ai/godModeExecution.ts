import { createHash, randomUUID } from 'node:crypto'
import type { Pool } from '@neondatabase/serverless'
import type { H3Event } from 'h3'
import { createError } from 'h3'

import { requireAuth } from '~~/server/utils/auth'
import { queryOneFresh, transaction } from '~~/server/utils/db'
import {
  appendGodModeAuditEvent,
  summarizeGodModeActionArguments,
  type GodModeAuditEventInput,
  type GodModeChannel
} from '~~/server/utils/godMode/audit'
import {
  isActiveGodModeAuthority,
  resolveGodModeAuthority,
  type GodModeAuthority
} from '~~/server/utils/godMode/authority'
import { getGodModeRouteAuditState } from '~~/server/utils/godMode/featureGate'
import {
  installGodModeInternalExecutionDelegator,
  type InstallGodModeInternalExecutionDelegatorInput
} from '~~/server/utils/godMode/internalExecutionDelegation'
import { sendGodModeAuditTerminal } from '~~/server/utils/queue'
import { getExecutor } from './executors'
import type { ActionExecutor, ExecutorClass, ExecutorResult, ExecutionServices } from './executors/types'
import { isTrustedPreDispatchError, markTrustedPreDispatchError } from './executionErrorProvenance'
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
  /** Advertised alias retained in immutable audit while toolName remains the canonical operation. */
  auditToolName?: string
  /** Controls actually bypassed by this trusted execution request. */
  bypassedControls?: GodModeAuditEventInput['bypassedControls']
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
  /** Request-local only; persisted solely on immutable audit events, never in the execution ledger. */
  actionArguments?: Record<string, unknown>
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
  db?: TransactionDb
}

interface SetExecutionStateInput {
  actorUserId: string
  channel: GodModeChannel
  idempotencyKey: string
  state: Exclude<LedgerState, 'in_progress'>
  resultReference?: string | null
  resultDigest?: string | null
  executionPhase?: string
  executionMetadata?: Record<string, unknown>
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
  }, db?: TransactionDb) => Promise<void>
  recordExecutionProgress: (input: {
    actorUserId: string
    idempotencyKey: string
    channel: GodModeChannel
    phase: string
    resultReference?: string | null
    metadata?: Record<string, unknown>
  }) => Promise<void>
  installInternalExecutionDelegator: (
    input: InstallGodModeInternalExecutionDelegatorInput & { event: H3Event }
  ) => void
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
    const inserted = await dbQueryOne<any>(input.db,
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
    const existing = await dbQueryOne<any>(input.db,
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
                    SET state = $4, result_reference = $5, result_digest = $6,
                        execution_phase = COALESCE($7, execution_phase),
                        execution_metadata = COALESCE($8::jsonb, execution_metadata), updated_at = NOW()
                  WHERE actor_user_id = $1 AND channel = $2 AND idempotency_key = $3`
    const params = [
      input.actorUserId, input.channel, input.idempotencyKey, input.state,
      input.resultReference ?? null, input.resultDigest ?? null,
      input.executionPhase ?? null,
      input.executionMetadata ? JSON.stringify(input.executionMetadata) : null
    ]
    if (db) await db.query(sql, params)
    else await queryOneFresh(`${sql} RETURNING actor_user_id`, params)
  },
  setExecutionScope: async (input, db) => {
    const sql = `UPDATE god_mode_execution_ledger
          SET tenant_id = $4, client_id = $5, updated_at = NOW()
        WHERE actor_user_id = $1 AND channel = $2 AND idempotency_key = $3
          AND state = 'in_progress'`
    const params = [input.actorUserId, input.channel, input.idempotencyKey, input.tenantId, input.clientId]
    if (db) await db.query(sql, params)
    else await queryOneFresh(`${sql} RETURNING actor_user_id`, params)
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
  installInternalExecutionDelegator: input => installGodModeInternalExecutionDelegator(input.event, input),
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
  bypassedControls?: GodModeAuditEventInput['bypassedControls']
): GodModeAuditEventInput {
  const controls = bypassedControls
    ?? (row as GodModeExecutionLedgerRow & { bypassedControls?: GodModeAuditEventInput['bypassedControls'] }).bypassedControls
    ?? ['confirmation']
  return {
    actorUserId: row.actorUserId,
    correlationId: row.correlationId,
    sessionDigest: (row as GodModeExecutionLedgerRow & { sessionDigest?: string }).sessionDigest ?? '0'.repeat(64),
    channel: row.channel,
    routeOrTool: row.routeOrTool,
    phase,
    tenantId: row.tenantId,
    clientId: row.clientId,
    bypassedControls: controls,
    outcomeCode,
    emergencyDisabled: false,
    actionArguments: row.actionArguments ?? {}
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

    const auditToolName = request.auditToolName ?? request.toolName
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
        toolName: auditToolName,
        executorClass: executor.executionClass,
        tenantId: request.tenantId,
        clientId: request.clientId,
        sessionDigest
      })
    } catch {
      operationalError(503, 'God mode execution ledger unavailable')
    }
    const row = Object.assign(claim.row, {
      sessionDigest,
      bypassedControls: request.bypassedControls ?? ['confirmation'],
      actionArguments: summarizeGodModeActionArguments(request.args)
    })
    if (!claim.claimed) {
      if (row.routeOrTool !== auditToolName) operationalError(409, 'Execution identity already used')
      if (row.state === 'succeeded') return ok({ resultRef: row.resultReference, replayed: true })
      if (row.state === 'failed') return fail('Action previously failed.')
      return fail('Action outcome is pending reconciliation.')
    }
    const auditIdentity = { ...row }

    try {
      await deps.appendAudit(auditEvent(auditIdentity, 'attempt', 'started'))
      if (row.bypassedControls.includes('mcp_scope')) {
        await deps.appendAudit(auditEvent(auditIdentity, 'bypass', 'pre_execution'))
      }
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
        throw markTrustedPreDispatchError(new Error('proposal claim rejected'), 'proposal_claim_failed')
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
      if (channel === 'mcp' && executor.executionClass === 'internal-http') {
        try {
          deps.installInternalExecutionDelegator({
            event: request.event,
            actorUserId: user.id,
            authority,
            correlationId: auditIdentity.correlationId,
            idempotencyKey: request.idempotencyKey,
            routeOrTool: request.toolName
          })
        } catch (error) {
          throw markTrustedPreDispatchError(
            error instanceof Error ? error : new Error('delegation unavailable'),
            'internal_delegation_unavailable'
          )
        }
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
      const dispatchUnknown = !isTrustedPreDispatchError(error)
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

export interface TrustedMcpGodModeResolvedMutationRequest extends TrustedMcpGodModeExecutionRequest {
  /** Supplemental executable registered beside its manifest. */
  tool: AiTool<any>
  executionClass?: ExecutorClass
  preflight?: (
    args: unknown,
    ctx: ToolContext
  ) => Promise<{ ok: true } | { ok: false, code: string, message: string, statusCode: number }>
  executeMutation?: (
    args: unknown,
    ctx: ToolContext,
    db: { query: (sql: string, params?: unknown[]) => Promise<any> }
  ) => Promise<ToolResult>
  executeSupplemental?: (
    args: unknown,
    ctx: ToolContext,
    services: TrustedSupplementalExecutionServices
  ) => Promise<ToolResult>
}

export interface TrustedSupplementalExecutionServices {
  /** Called exactly once by the trusted runner at the final line before irreversible dispatch. */
  markDispatched: () => Promise<void>
  /** Persists a bounded provider reference as soon as the runner owns one. */
  captureResult: (result: ToolResult) => Promise<void>
}

function resolvedResultIdentity(result: ToolResult): { resultReference: string, resultDigest: string } {
  const digest = createHash('sha256').update(stableJson(result)).digest('hex')
  const data = result.ok && result.data && typeof result.data === 'object'
    ? result.data as Record<string, unknown>
    : {}
  const preferred = ['resultRef', 'proposalId', 'jobId', 'assetId', 'projectId']
    .map(key => data[key])
    .find(value => typeof value === 'string' && value.length > 0)
  return {
    resultReference: typeof preferred === 'string' ? preferred.slice(0, 128) : `mcp-result:${digest.slice(0, 64)}`,
    resultDigest: digest
  }
}

/**
 * Idempotent audited execution for supplemental MCP mutations which do not use the Task 5 proposal
 * executor registry (generation, media/banner proposals, and confirm_action). The immutable ledger
 * claim and attempt/bypass audit happen before schema, scope, handler, provider, or pending-row claim.
 */
export function createTrustedMcpGodModeResolvedMutationExecutor(deps: GodModeExecutionDependencies) {
  return async function execute(request: TrustedMcpGodModeResolvedMutationRequest): Promise<ToolResult> {
    if (
      request.authenticatedUserId !== request.authority.actorUserId
      || !isActiveGodModeAuthority(request.authority, request.authenticatedUserId)
      || !/^mcp:[0-9a-f]{64}$/.test(request.idempotencyKey)
      || !/^[0-9a-f]{64}$/.test(request.sessionDigest)
      || !request.tool.mutates
      || request.tool.name !== request.toolName
    ) operationalError(403, 'Invalid MCP owner execution authority')

    // Immediate owner-local mutations use one serialization and durability boundary. A failed audit,
    // memory write, outbox insert, or terminal update rolls the claim back too, so the same logical
    // request can safely retry instead of being poisoned by an orphaned failed claim.
    if (request.executionClass === 'local-transactional') {
      if (!request.executeMutation) operationalError(503, 'God mode local executor unavailable')
      const ctx: ToolContext = {
        userId: request.authenticatedUserId,
        userRole: 'owner',
        permissionGroups: [],
        source: 'mcp',
        godModeExecutionKey: request.idempotencyKey,
        event: request.event
      }
      try {
        return await deps.transaction(async db => {
          const claim = await deps.claimExecution({
            actorUserId: request.authenticatedUserId,
            channel: 'mcp',
            idempotencyKey: request.idempotencyKey,
            correlationId: deps.correlationId(),
            toolName: request.toolName,
            executorClass: 'local-transactional',
            tenantId: request.tenantId,
            clientId: request.clientId,
            sessionDigest: request.sessionDigest,
            db
          })
          const row = Object.assign(claim.row, {
            sessionDigest: request.sessionDigest,
            bypassedControls: request.bypassedControls ?? ['confirmation'],
            actionArguments: summarizeGodModeActionArguments(request.args)
          })
          if (!claim.claimed) {
            if (row.routeOrTool !== request.toolName) return fail('Execution identity already used.')
            if (row.state === 'succeeded') return ok({ resultRef: row.resultReference, replayed: true })
            if (row.state === 'failed') return fail('Action previously failed.')
            return fail('Action outcome is pending reconciliation.')
          }

          await deps.appendAudit(auditEvent(row, 'attempt', 'started'), db)
          if (row.bypassedControls.includes('mcp_scope')) {
            await deps.appendAudit(auditEvent(row, 'bypass', 'pre_execution'), db)
          }

          const failDurably = async (code: string, message: string): Promise<ToolResult> => {
            await deps.appendAudit(auditEvent(row, 'failed', code), db)
            await deps.setExecutionState({
              actorUserId: request.authenticatedUserId,
              channel: 'mcp',
              idempotencyKey: request.idempotencyKey,
              state: 'failed',
              executionPhase: 'claimed'
            }, db)
            return fail(message)
          }

          const parsed = request.tool.parameters.safeParse(request.args)
          if (!parsed.success) return await failDurably('schema_invalid', 'Invalid tool input.')

          let scope: Awaited<ReturnType<GodModeExecutionDependencies['validateScope']>>
          try {
            scope = await deps.validateScope({
              actorUserId: request.authenticatedUserId,
              tenantId: request.tenantId,
              clientId: request.clientId,
              args: parsed.data,
              ctx
            })
          } catch {
            return await failDurably('scope_validation_failed', 'Target scope could not be validated.')
          }
          if (scope.ok === false) return await failDurably(scope.code, 'Target is outside the authenticated scope.')
          if (deps.setExecutionScope) {
            await deps.setExecutionScope({
              actorUserId: request.authenticatedUserId,
              channel: 'mcp',
              idempotencyKey: request.idempotencyKey,
              tenantId: scope.tenantId,
              clientId: scope.clientId
            }, db)
          }
          row.tenantId = scope.tenantId
          row.clientId = scope.clientId

          await db.query('SAVEPOINT god_mode_local_mutation')
          let result: ToolResult
          try {
            result = await request.executeMutation!(parsed.data, ctx, db)
            if (!result.ok) throw Object.assign(new Error('local mutation rejected'), { boundedCode: 'handler_rejected' })
          } catch (error) {
            await db.query('ROLLBACK TO SAVEPOINT god_mode_local_mutation')
            await db.query('RELEASE SAVEPOINT god_mode_local_mutation')
            const code = error && typeof error === 'object' && 'boundedCode' in error
              ? String((error as { boundedCode: unknown }).boundedCode).slice(0, 64)
              : 'local_transaction_failed'
            return await failDurably(code, 'I could not save that just now — please try again in a moment.')
          }
          const identity = resolvedResultIdentity(result)
          if (request.toolName === 'remember') {
            await db.query(
              `INSERT INTO ai_action_audit
                (pending_id, user_id, confirmed_by, tool_name, risk_tier, client_scope, payload, result_ref, outcome)
               VALUES (NULL, $1, NULL, 'remember', 'auto', NULL, $2::jsonb, $3, 'executed')`,
              [
                request.authenticatedUserId,
                JSON.stringify({ source: 'mcp_god_mode', argKeys: Object.keys(parsed.data as Record<string, unknown>), idempotencyKey: request.idempotencyKey }),
                identity.resultReference
              ]
            )
          }
          await deps.appendAudit(auditEvent(row, 'succeeded', 'executed'), db)
          await deps.setExecutionState({
            actorUserId: request.authenticatedUserId,
            channel: 'mcp',
            idempotencyKey: request.idempotencyKey,
            state: 'succeeded',
            resultReference: identity.resultReference,
            resultDigest: identity.resultDigest,
            executionPhase: 'result_captured'
          }, db)
          await db.query('RELEASE SAVEPOINT god_mode_local_mutation')
          return result
        })
      } catch {
        return fail('I could not save that just now — please try again in a moment.')
      }
    }

    let claim: { claimed: boolean, row: GodModeExecutionLedgerRow }
    try {
      claim = await deps.claimExecution({
        actorUserId: request.authenticatedUserId,
        channel: 'mcp',
        idempotencyKey: request.idempotencyKey,
        correlationId: deps.correlationId(),
        toolName: request.toolName,
        executorClass: request.executionClass ?? 'internal-http',
        tenantId: request.tenantId,
        clientId: request.clientId,
        sessionDigest: request.sessionDigest
      })
    } catch {
      operationalError(503, 'God mode execution ledger unavailable')
    }
    const row = Object.assign(claim.row, {
      sessionDigest: request.sessionDigest,
      bypassedControls: request.bypassedControls ?? ['confirmation'],
      actionArguments: summarizeGodModeActionArguments(request.args)
    })
    if (!claim.claimed) {
      if (row.routeOrTool !== request.toolName) operationalError(409, 'Execution identity already used')
      if (row.state === 'succeeded') return ok({ resultRef: row.resultReference, replayed: true })
      if (row.state === 'failed') return fail('Action previously failed.')
      return fail('Action outcome is pending reconciliation.')
    }
    const auditIdentity = { ...row }
    try {
      await deps.appendAudit(auditEvent(auditIdentity, 'attempt', 'started'))
      if (row.bypassedControls.includes('mcp_scope')) {
        await deps.appendAudit(auditEvent(auditIdentity, 'bypass', 'pre_execution'))
      }
    } catch {
      await deps.setExecutionState({
        actorUserId: request.authenticatedUserId,
        channel: 'mcp',
        idempotencyKey: request.idempotencyKey,
        state: 'failed'
      }).catch(() => {})
      operationalError(503, 'God mode audit unavailable')
    }

    const terminateBeforeDispatch = async (
      code: string,
      message: string,
      details?: Record<string, unknown>,
    ): Promise<ToolResult> => {
      try {
        await deps.transaction(async db => {
          await deps.appendAudit(auditEvent(auditIdentity, 'failed', code), db)
          await deps.setExecutionState({
            actorUserId: request.authenticatedUserId,
            channel: 'mcp',
            idempotencyKey: request.idempotencyKey,
            state: 'failed'
          }, db)
        })
      } catch {
        operationalError(503, 'God mode audit unavailable')
      }
      return fail(message, code, details)
    }

    const parsed = request.tool.parameters.safeParse(request.args)
    if (!parsed.success) return await terminateBeforeDispatch('schema_invalid', 'Invalid tool input.')

    const ctx: ToolContext = {
      userId: request.authenticatedUserId,
      userRole: 'owner',
      permissionGroups: [],
      source: 'mcp',
      godModeExecutionKey: request.idempotencyKey,
      event: request.event
    }
    const scope = await deps.validateScope({
      actorUserId: request.authenticatedUserId,
      tenantId: request.tenantId,
      clientId: request.clientId,
      args: parsed.data,
      ctx
    })
    if (scope.ok === false) return await terminateBeforeDispatch(scope.code, 'Target is outside the authenticated scope.')
    if (deps.setExecutionScope) {
      try {
        await deps.setExecutionScope({
          actorUserId: request.authenticatedUserId,
          channel: 'mcp',
          idempotencyKey: request.idempotencyKey,
          tenantId: scope.tenantId,
          clientId: scope.clientId
        })
      } catch {
        return await terminateBeforeDispatch('scope_persistence_failed', 'Could not verify the target scope.')
      }
    }

    if (request.preflight) {
      let preflight: Awaited<ReturnType<NonNullable<typeof request.preflight>>>
      try {
        preflight = await request.preflight(parsed.data, ctx)
      } catch {
        await terminateBeforeDispatch('provider_preflight_failed', 'Provider availability could not be verified.')
        operationalError(503, 'Provider availability could not be verified.')
      }
      if (preflight.ok === false) {
        await terminateBeforeDispatch(preflight.code, preflight.message)
        operationalError(preflight.statusCode, preflight.message)
      }
    }

    const markDispatchAmbiguous = async (
      resultIdentity?: { resultReference: string, resultDigest: string }
    ): Promise<ToolResult> => {
      try {
        await deps.transaction(async db => {
          await deps.appendAudit(auditEvent(auditIdentity, 'ambiguous', 'dispatch_outcome_unknown'), db)
          await deps.setExecutionState({
            actorUserId: request.authenticatedUserId,
            channel: 'mcp',
            idempotencyKey: request.idempotencyKey,
            state: 'ambiguous',
            resultReference: resultIdentity?.resultReference ?? null,
            resultDigest: resultIdentity?.resultDigest ?? null,
            executionPhase: resultIdentity ? 'result_captured' : 'dispatched',
            executionMetadata: {
              supplemental: true,
              executionClass: request.executionClass ?? 'internal-http',
              ...(resultIdentity ? { resultDigest: resultIdentity.resultDigest } : {})
            }
          }, db)
        })
      } catch {
        await deps.setExecutionState({
          actorUserId: request.authenticatedUserId,
          channel: 'mcp',
          idempotencyKey: request.idempotencyKey,
          state: 'ambiguous',
          resultReference: resultIdentity?.resultReference ?? null,
          resultDigest: resultIdentity?.resultDigest ?? null,
          executionPhase: resultIdentity ? 'result_captured' : 'dispatched',
          executionMetadata: {
            supplemental: true,
            executionClass: request.executionClass ?? 'internal-http',
            ...(resultIdentity ? { resultDigest: resultIdentity.resultDigest } : {})
          }
        }).catch(() => {})
        operationalError(503, 'God mode audit unavailable')
      }
      return fail('Action outcome is pending reconciliation.')
    }

    if (!request.executeSupplemental) {
      return await terminateBeforeDispatch('supplemental_executor_unavailable', 'God mode action failed.')
    }

    let dispatched = false
    let dispatchCheckpointCalls = 0
    let capturedIdentity: { resultReference: string, resultDigest: string } | undefined
    let resultCaptured = false
    const services: TrustedSupplementalExecutionServices = {
      markDispatched: async () => {
        dispatchCheckpointCalls++
        if (dispatchCheckpointCalls !== 1) throw new Error('dispatch checkpoint called more than once')
        await deps.recordExecutionProgress({
          actorUserId: request.authenticatedUserId,
          channel: 'mcp',
          idempotencyKey: request.idempotencyKey,
          phase: 'dispatched',
          metadata: {
            supplemental: true,
            executionClass: request.executionClass ?? 'internal-http'
          }
        })
        dispatched = true
      },
      captureResult: async result => {
        if (!dispatched) throw new Error('result captured before dispatch checkpoint')
        if (resultCaptured) throw new Error('result captured more than once')
        capturedIdentity = resolvedResultIdentity(result)
        await deps.recordExecutionProgress({
          actorUserId: request.authenticatedUserId,
          channel: 'mcp',
          idempotencyKey: request.idempotencyKey,
          phase: 'result_captured',
          resultReference: capturedIdentity.resultReference,
          metadata: {
            supplemental: true,
            executionClass: request.executionClass ?? 'internal-http',
            resultDigest: capturedIdentity.resultDigest
          }
        })
        resultCaptured = true
      }
    }

    let result: ToolResult
    try {
      result = await request.executeSupplemental(parsed.data, ctx, services)
    } catch {
      if (!dispatched) return await terminateBeforeDispatch('dispatch_not_started', 'God mode action failed.')
      return await markDispatchAmbiguous(capturedIdentity)
    }
    if (!result.ok && !dispatched) {
      return await terminateBeforeDispatch(result.code ?? 'precondition_failed', result.error, result.details)
    }
    if (!dispatched || dispatchCheckpointCalls !== 1) {
      return await terminateBeforeDispatch('dispatch_checkpoint_missing', 'God mode action failed.')
    }
    if (!result.ok) return await markDispatchAmbiguous(capturedIdentity)

    const identity = capturedIdentity ?? resolvedResultIdentity(result)
    if (!resultCaptured) {
      try {
        await services.captureResult(result)
      } catch {
        return await markDispatchAmbiguous(identity)
      }
    }
    const terminal = auditEvent(auditIdentity, 'succeeded', 'executed')
    try {
      await deps.transaction(async db => {
        await deps.appendAudit(terminal, db)
        await deps.setExecutionState({
          actorUserId: request.authenticatedUserId,
          channel: 'mcp',
          idempotencyKey: request.idempotencyKey,
          state: 'succeeded',
          resultReference: identity.resultReference,
          resultDigest: identity.resultDigest
        }, db)
      })
    } catch {
      await deps.setExecutionState({
        actorUserId: request.authenticatedUserId,
        channel: 'mcp',
        idempotencyKey: request.idempotencyKey,
        state: 'ambiguous',
        resultReference: identity.resultReference,
        resultDigest: identity.resultDigest
      }).catch(() => {})
      await deps.enqueueTerminalAudit(request.event, terminal).catch(() => false)
      return fail('Action outcome is pending reconciliation.')
    }
    return result
  }
}

export const executeTrustedMcpGodModeResolvedMutation =
  createTrustedMcpGodModeResolvedMutationExecutor(defaultDependencies)

interface TrustedReadIdentity extends TrustedExecutionIdentity {
  correlationId: string
}

function readSchemaFailureMessage(error: unknown): string {
  const issues = Array.isArray((error as any)?.issues) ? (error as any).issues : []
  const custom = issues.find((issue: any) => issue?.code === 'custom' && typeof issue?.message === 'string')
  if (!custom) return 'Invalid tool input.'
  const message = custom.message.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 240)
  return message ? `Invalid tool input: ${message}` : 'Invalid tool input.'
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
    return fail(readSchemaFailureMessage(parsed.error))
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
      || !/^mcp:[0-9a-f]{64}$/.test(request.idempotencyKey)
      || !/^[0-9a-f]{64}$/.test(request.sessionDigest)
    ) operationalError(403, 'Invalid MCP owner execution authority')

    return await executeGodModeReadCore(deps, request, {
      user: { id: request.authenticatedUserId, role: 'owner', permissionGroups: [] },
      authority: request.authority,
      channel: 'mcp',
      sessionDigest: request.sessionDigest,
      // Some MCP hosts reuse a JSON-RPC request ID when repeating the same read. Read transport
      // idempotency therefore must not double as the immutable audit event's unique correlation.
      correlationId: deps.correlationId()
    })
  }
}

export const executeTrustedMcpGodModeReadTool = createTrustedMcpGodModeReadExecutor(defaultDependencies)
