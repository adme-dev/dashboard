import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { terminalError } from '../pendingActions'
import { ambiguousDispatchError, type ActionExecutor } from '../executors/types'
import { fail, ok, type ToolContext, type ToolResult } from '../toolContext'
import { sha256 } from './departmentExecutionLedger'

export const NATIVE_MARKETING_ACTION = 'native_marketing_operation'
export const NATIVE_MARKETING_RICH_ACTION = 'native_marketing_rich_operation'
const envelopeSchema = z.strictObject({
  version: z.literal(1), actorId: z.string(), messageId: z.string().min(1).max(128),
  operation: z.string().min(1).max(128), args: z.unknown(),
  executionKey: z.string().regex(/^chat:[a-f0-9]{64}$/), digest: z.string().regex(/^[a-f0-9]{64}$/),
  clientScope: z.string().uuid().optional(), riskTier: z.enum(['confirm', 'rich_confirm']), nativeMarketing: z.literal(true)
})
export type NativeMarketingEnvelope = z.infer<typeof envelopeSchema>

/** Persist only the native human-confirm envelope, never execute the marketing operation. The outer
 * chat row owns click/expiry/idempotent claim; the existing department row/ledger owns domain writes. */
export async function prepareNativeMarketingAction(
  ctx: ToolContext, messageId: string, operation: string, args: unknown, riskTier: 'confirm' | 'rich_confirm'
): Promise<ToolResult> {
  if (!ctx.conversationId) return fail('A conversation is required for confirmation.', 'conversation_required')
  const digest = sha256({ actor: ctx.userId, messageId, tool: operation, args })
  const envelope: NativeMarketingEnvelope = { version: 1, actorId: ctx.userId, messageId,
    operation, args, executionKey: `chat:${digest}`, digest, clientScope: ctx.clientScope,
    riskTier, nativeMarketing: true }
  if (JSON.stringify(envelope).length > 100_000) return fail('Marketing confirmation is too large.', 'bad_args')
  const action = riskTier === 'rich_confirm' ? NATIVE_MARKETING_RICH_ACTION : NATIVE_MARKETING_ACTION
  return transactionWithoutRetry(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`native-marketing:${ctx.userId}:${digest}`])
    const prior = (await db.query(`SELECT id, status, expires_at FROM ai_pending_actions
      WHERE user_id=$1 AND conversation_id=$2 AND source='chat' AND tool_name=$3
        AND resolved_payload->>'executionKey'=$4`, [ctx.userId, ctx.conversationId, action, envelope.executionKey])).rows[0]
    if (prior && (prior.status !== 'proposed' || Date.parse(prior.expires_at) <= Date.now())) {
      return fail('This exact action was already handled or expired.', 'already_handled')
    }
    const row = prior ?? (await db.query(`INSERT INTO ai_pending_actions
      (conversation_id,user_id,tool_name,resolved_payload,status,source)
      VALUES ($1,$2,$3,$4::jsonb,'proposed','chat') RETURNING id`,
    [ctx.conversationId, ctx.userId, action, JSON.stringify(envelope)])).rows[0]
    if (!row) throw new Error('Marketing confirmation unavailable')
    return ok({ proposalId: row.id, resolved: envelope })
  })
}

/** Bounded provider evidence only: no payload text, credentials or invented delivery conclusion. */
export function nativeMarketingReceipt(operation: string, value: unknown, fallbackRef: string) {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const nested = data.result && typeof data.result === 'object' ? data.result as Record<string, unknown> : {}
  const rawStatus = data.status ?? nested.status
  const status = typeof rawStatus === 'string' && /^[a-zA-Z_]{1,40}$/.test(rawStatus) ? rawStatus.toLowerCase() : undefined
  const facts = Object.fromEntries(['complete', 'ledgerRecorded', 'readbackVerified', 'providerAccepted', 'providerServingVerified',
    'published', 'sent', 'providerChanged', 'operationSucceeded', 'providerRejected', 'reconciliationRequired'].flatMap((key) => {
    const value = data[key] ?? nested[key]
    return typeof value === 'boolean' ? [[key, value]] : []
  })) as Record<string, boolean>
  const reference = typeof data.proposalId === 'string' && /^[a-zA-Z0-9:_-]{1,128}$/.test(data.proposalId) ? data.proposalId : fallbackRef
  const ambiguous = facts.ledgerRecorded === false || facts.reconciliationRequired === true || facts.operationSucceeded === false
    || ['unknown', 'partial', 'failed', 'reconciliation_required'].includes(status ?? '')
    || (facts.complete === false && !['proposed', 'draft', 'in_review', 'queued', 'accepted', 'pending', 'paused'].includes(status ?? ''))
  const proposalOnly = /marketing_(?:propose|prepare)_/.test(operation)
  const label = ambiguous ? 'Marketing operation needs manual reconciliation' : proposalOnly ? 'Marketing proposal prepared' : 'Marketing operation returned'
  const evidence = [status ? `status=${status}` : '', ...Object.entries(facts).map(([key, value]) => `${key}=${value}`)].filter(Boolean).join(', ')
  const summary = `${label}: ${operation}.${evidence ? ` Receipt: ${evidence}.` : ''} Reference: ${reference}.${ambiguous ? ' Inspect the retained domain outcome before taking another action.' : proposalOnly ? ' Continue with its required review and execution steps.' : ''}`
  return { ambiguous, resultRef: reference, summary, evidence: { status: status ?? null, ...facts } }
}

function makeExecutor(toolName: string, riskTier: 'confirm' | 'rich_confirm'): ActionExecutor {
  return { toolName, label: 'marketing operation', riskTier, executionClass: 'external-provider',
    // No legacy-role permission shortcut: the executor resolves fresh custom-role groups and operator
    // grants itself. Its model-facing operation still carries MARKETING_MANAGEMENT for discovery.
    async execute(raw, ctx) {
      const parsed = envelopeSchema.safeParse(raw)
      if (!parsed.success) throw terminalError('Invalid marketing confirmation')
      const envelope = parsed.data
      const digest = sha256({ actor: ctx.userId, messageId: envelope.messageId, tool: envelope.operation, args: envelope.args })
      if (envelope.actorId !== ctx.userId || envelope.digest !== digest || envelope.executionKey !== `chat:${digest}`
        || envelope.riskTier !== riskTier) throw terminalError('Marketing confirmation identity mismatch')
      const { executeConfirmedNativeMarketingAction } = await import('./nativeTools')
      const result = await executeConfirmedNativeMarketingAction(envelope, { ...ctx, source: 'chat', clientScope: envelope.clientScope })
      if (!result.ok) {
        if (result.code === 'reconciliation_required' || result.code === 'unavailable') {
          const receipt = nativeMarketingReceipt(envelope.operation, { ...result.details, reconciliationRequired: true }, envelope.executionKey)
          throw Object.assign(ambiguousDispatchError('Marketing outcome needs reconciliation', {
            resultRef: receipt.resultRef, executionMetadata: receipt.evidence
          }), { userSummary: receipt.summary })
        }
        throw terminalError(result.error)
      }
      const receipt = nativeMarketingReceipt(envelope.operation, result.data, envelope.executionKey)
      if (receipt.ambiguous) {
        throw Object.assign(ambiguousDispatchError('Marketing receipt requires reconciliation', {
          resultRef: receipt.resultRef, executionMetadata: receipt.evidence
        }), { userSummary: receipt.summary })
      }
      return { resultRef: receipt.resultRef, summary: receipt.summary }
    }
  }
}
export const nativeMarketingExecutor = makeExecutor(NATIVE_MARKETING_ACTION, 'confirm')
export const nativeMarketingRichExecutor = makeExecutor(NATIVE_MARKETING_RICH_ACTION, 'rich_confirm')
