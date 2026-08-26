/**
 * God-mode mutation families for the social Engagement Inbox.
 *
 * Owners run every non-GET /api route under the execution ledger; a write route without a
 * registered family is refused with 503 "God mode mutation coordination required". Until this
 * module existed every inbox write (account sync, reply, status change, notes, saved replies,
 * SLA policies, automation rules, approvals, AI triage/draft/actions) failed for owners only —
 * the Refresh button 503'd, so an owner's inbox showed "0 / 0 active accounts" and no threads.
 *
 * Two boundaries are used, mirroring `qr/godModeMutations.ts` and `searchAuthority/godModeMutations.ts`:
 *
 * - **Transaction families** — DB-only writes. The route hands its work to
 *   `executeSocialInboxMutation`, which runs it inside the coordinated transaction for owners and
 *   a plain transaction for everyone else. The result must carry an `id` (the replay reference).
 * - **External families** — writes that also touch a provider (platform reply send, poll
 *   dispatcher, Groq/Workers AI, action executors, SSE presence). These use the execution-ledger
 *   protocol via `executeSocialInboxExternalMutation`; the route calls `run.markDispatched()`
 *   once the provider has accepted the work and returns a small JSON result stored for replay.
 */
import type { H3Event } from 'h3'
import { createError, getRequestURL, readBody } from 'h3'

import { transaction } from '~~/server/utils/db'
import { sha256Hex } from '~~/server/utils/exportTokens'
import { appendGodModeAuditEvent } from '~~/server/utils/godMode/audit'
import { registerGodModeMutationFamily } from '~~/server/utils/godMode/featureGate'
import {
  defaultExternalLedgerDependencies,
  executeGodModeExternalMutation,
  prepareGodModeExternalMutation,
  type GodModeExternalMutation,
  type GodModeExternalRun
} from '~~/server/utils/godMode/externalLedgerCoordinator'
import {
  defineGodModeTransactionOperation,
  executeGodModeTransactionMutation,
  prepareGodModeTransactionMutation,
  type GodModeTransactionDb,
  type GodModeTransactionOperation
} from '~~/server/utils/godMode/transactionCoordinator'
import { digestMcpRequestBody } from '~~/shared/utils/mcpRequestClaim'

const UUID = '[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}'
const BASE = '/api/agency/social/inbox'
const route = (suffix: string) => new RegExp(`^${BASE}${suffix}$`, 'i')

// ---------------------------------------------------------------------------
// Transaction-bound families (DB only)
// ---------------------------------------------------------------------------

export type SocialInboxMutationKind
  = 'automation-rule-create' | 'automation-rule-update' | 'automation-rule-delete'
    | 'saved-reply-create' | 'saved-reply-update' | 'saved-reply-delete'
    | 'sla-policy-create' | 'sla-policy-update' | 'sla-policy-delete'
    | 'conversation-update' | 'conversation-native-links' | 'conversation-note'
    | 'conversation-client-approval' | 'ai-action-propose' | 'response-queue-reject'

interface FamilyDef {
  kind: SocialInboxMutationKind
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  matches: (path: string) => boolean
  name: string
}

const TRANSACTION_FAMILIES: FamilyDef[] = [
  { kind: 'automation-rule-create', method: 'POST', matches: p => p === `${BASE}/automation-rules`, name: 'social automation rule creation' },
  { kind: 'automation-rule-update', method: 'PATCH', matches: p => route(`/automation-rules/${UUID}`).test(p), name: 'social automation rule update' },
  { kind: 'automation-rule-delete', method: 'DELETE', matches: p => route(`/automation-rules/${UUID}`).test(p), name: 'social automation rule deletion' },
  { kind: 'saved-reply-create', method: 'POST', matches: p => p === `${BASE}/saved-replies`, name: 'social saved reply creation' },
  { kind: 'saved-reply-update', method: 'PATCH', matches: p => route(`/saved-replies/${UUID}`).test(p), name: 'social saved reply update' },
  { kind: 'saved-reply-delete', method: 'DELETE', matches: p => route(`/saved-replies/${UUID}`).test(p), name: 'social saved reply deletion' },
  { kind: 'sla-policy-create', method: 'POST', matches: p => p === `${BASE}/sla-policies`, name: 'social SLA policy save' },
  { kind: 'sla-policy-update', method: 'PATCH', matches: p => route(`/sla-policies/${UUID}`).test(p), name: 'social SLA policy update' },
  { kind: 'sla-policy-delete', method: 'DELETE', matches: p => route(`/sla-policies/${UUID}`).test(p), name: 'social SLA policy deletion' },
  { kind: 'conversation-update', method: 'PATCH', matches: p => route(`/conversations/${UUID}`).test(p), name: 'social conversation update' },
  { kind: 'conversation-native-links', method: 'PATCH', matches: p => route(`/conversations/${UUID}/native-links`).test(p), name: 'social conversation workflow link update' },
  { kind: 'conversation-note', method: 'POST', matches: p => route(`/conversations/${UUID}/note`).test(p), name: 'social conversation note' },
  { kind: 'conversation-client-approval', method: 'POST', matches: p => route(`/conversations/${UUID}/client-approval`).test(p), name: 'social reply client approval request' },
  { kind: 'ai-action-propose', method: 'POST', matches: p => route(`/conversations/${UUID}/ai-actions/propose`).test(p), name: 'social AI action proposal' },
  { kind: 'response-queue-reject', method: 'POST', matches: p => route(`/response-queue/${UUID}/reject`).test(p), name: 'social response queue rejection' }
]

const operationsKey = Symbol('socialInboxGodModeOperations')
type Operations = Partial<Record<SocialInboxMutationKind, GodModeTransactionOperation>>

function operations(event: H3Event): Operations {
  const context = event.context as Record<PropertyKey, unknown>
  const existing = context[operationsKey] as Operations | undefined
  if (existing) return existing
  const created: Operations = {}
  context[operationsKey] = created
  return created
}

function operationFor(event: H3Event, def: FamilyDef): GodModeTransactionOperation {
  const store = operations(event)
  const existing = store[def.kind]
  if (existing) return existing
  const operation = defineGodModeTransactionOperation({
    routeOrTool: `${def.method} ${getRequestURL(event).pathname}`,
    mutationName: def.name,
    missingResultMessage: `God mode ${def.name} did not produce a durable result`,
    retryableInProgress: true
  })
  store[def.kind] = operation
  return operation
}

async function digest(event: H3Event, def: FamilyDef): Promise<string> {
  // DELETE routes carry their identity in the path (and optional ?clientId), not a body.
  if (def.method === 'DELETE') {
    const url = getRequestURL(event)
    return await sha256Hex(`${url.pathname}${url.search}`)
  }
  return await digestMcpRequestBody((await readBody(event).catch(() => null)) ?? {})
}

/**
 * Run an inbox DB write inside the right transaction boundary. `mutate` must use `db.query`
 * (pg-style `{ rows }`) and return an object with an `id` — the ledger's replay reference.
 * `replay` rebuilds the same response from that id when an owner retries with the same
 * Idempotency-Key.
 */
export async function executeSocialInboxMutation<T extends { id: string }>(
  event: H3Event,
  kind: SocialInboxMutationKind,
  mutate: (db: GodModeTransactionDb) => Promise<T>,
  replay: (db: GodModeTransactionDb, resultReference: string) => Promise<T>
): Promise<T> {
  const store = (event.context as Record<PropertyKey, unknown> | undefined)?.[operationsKey] as Operations | undefined
  // Staff requests have no prepared operation: same transaction boundary, no ledger claim.
  if (!store) return await transaction(mutate)
  const operation = store[kind]
  if (!operation) throw createError({ statusCode: 503, statusMessage: 'God mode mutation coordination unavailable' })
  return await executeGodModeTransactionMutation(event, operation, transaction, mutate, replay)
}

/**
 * Adapter from the coordinator's pg-style `db.query` to the `{ queryOne, execute }` shape the
 * inbox helpers (`dispatchReply`, `recordSocialInboxApprovalEvent`, …) were written against.
 */
export function socialInboxTransactionDb(db: GodModeTransactionDb) {
  return {
    queryOne: async <T = unknown>(sql: string, params?: unknown[]): Promise<T | null> => {
      const result = await db.query(sql, params ?? [])
      return (result.rows?.[0] ?? null) as T | null
    },
    execute: async (sql: string, params?: unknown[]): Promise<number> => {
      const result = await db.query(sql, params ?? [])
      return result.rowCount ?? 0
    }
  }
}

// ---------------------------------------------------------------------------
// External-provider families (platform send / poll dispatcher / AI / executors / SSE)
// ---------------------------------------------------------------------------

export type SocialInboxExternalKind
  = 'accounts-sync' | 'conversation-reply' | 'response-queue-approve'
    | 'ai-draft' | 'ai-triage' | 'ai-action-confirm' | 'typing'

interface ExternalDef {
  kind: SocialInboxExternalKind
  method: 'POST'
  matches: (path: string) => boolean
  mutation: GodModeExternalMutation
}

const EXTERNAL_FAMILIES: ExternalDef[] = [
  { kind: 'accounts-sync', method: 'POST', matches: p => p === `${BASE}/accounts/sync`, mutation: { label: 'social inbox account sync', coordinationKey: Symbol('godModeSocialInboxAccountsSync') } },
  { kind: 'conversation-reply', method: 'POST', matches: p => route(`/conversations/${UUID}/reply`).test(p), mutation: { label: 'social reply send', coordinationKey: Symbol('godModeSocialInboxReply') } },
  { kind: 'response-queue-approve', method: 'POST', matches: p => route(`/response-queue/${UUID}/approve`).test(p), mutation: { label: 'social response queue approval', coordinationKey: Symbol('godModeSocialInboxApprove') } },
  { kind: 'ai-draft', method: 'POST', matches: p => route(`/conversations/${UUID}/ai-draft`).test(p), mutation: { label: 'social AI reply draft', coordinationKey: Symbol('godModeSocialInboxAiDraft') } },
  { kind: 'ai-triage', method: 'POST', matches: p => route(`/conversations/${UUID}/ai-triage`).test(p), mutation: { label: 'social AI triage', coordinationKey: Symbol('godModeSocialInboxAiTriage') } },
  { kind: 'ai-action-confirm', method: 'POST', matches: p => route(`/conversations/${UUID}/ai-actions/confirm`).test(p), mutation: { label: 'social AI action confirmation', coordinationKey: Symbol('godModeSocialInboxAiActionConfirm') } },
  { kind: 'typing', method: 'POST', matches: p => route(`/conversations/${UUID}/typing`).test(p), mutation: { label: 'social typing presence', coordinationKey: Symbol('godModeSocialInboxTyping') } }
]

const externalByKind = new Map(EXTERNAL_FAMILIES.map(def => [def.kind, def] as const))

/**
 * Run an inbox write that hands work to an external provider under God mode coordination.
 * `work` must call `run.markDispatched()` once the provider accepted the work and return a
 * small JSON-serialisable result. On an owner replay `run.replay` is true and `run.replayResult`
 * holds the stored result — return it instead of repeating the side effect.
 */
export function executeSocialInboxExternalMutation<T>(
  event: H3Event,
  kind: SocialInboxExternalKind,
  work: (run: GodModeExternalRun<T>) => Promise<T>
): Promise<T> {
  const def = externalByKind.get(kind)
  if (!def) throw createError({ statusCode: 503, statusMessage: 'God mode mutation coordination unavailable' })
  return executeGodModeExternalMutation(event, def.mutation, 1, work)
}

/**
 * The ledger stores the external-family result in `execution_metadata`, which carries a
 * 4096-byte CHECK. The account-sync result includes a per-channel array that can exceed that, so
 * only this compact summary is stored for replay; the live caller still receives the full result.
 */
export interface SocialInboxSyncReplaySummary {
  synced: number
  automated?: number
  breaches?: number
  skipped?: number
  timedOut?: boolean
  channelCount: number
  errorCount: number
  replayed: true
}

export function compactSocialInboxSyncResult(result: {
  synced?: number
  automated?: number
  breaches?: number
  skipped?: number
  timedOut?: boolean
  channels?: Array<{ status?: string }>
} | null | undefined): SocialInboxSyncReplaySummary {
  const channels = Array.isArray(result?.channels) ? result.channels : []
  return {
    synced: Number(result?.synced ?? 0),
    ...(result?.automated != null ? { automated: Number(result.automated) } : {}),
    ...(result?.breaches != null ? { breaches: Number(result.breaches) } : {}),
    ...(result?.skipped != null ? { skipped: Number(result.skipped) } : {}),
    ...(result?.timedOut != null ? { timedOut: Boolean(result.timedOut) } : {}),
    channelCount: channels.length,
    errorCount: channels.filter(c => c?.status === 'error').length,
    replayed: true
  }
}

// ---------------------------------------------------------------------------
// Path matchers (exported for tests)
// ---------------------------------------------------------------------------

export function matchesSocialInboxTransactionFamily(method: string, path: string): SocialInboxMutationKind | null {
  const upper = method.toUpperCase()
  return TRANSACTION_FAMILIES.find(def => def.method === upper && def.matches(path))?.kind ?? null
}

export function matchesSocialInboxExternalFamily(method: string, path: string): SocialInboxExternalKind | null {
  const upper = method.toUpperCase()
  return EXTERNAL_FAMILIES.find(def => def.method === upper && def.matches(path))?.kind ?? null
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerGodModeSocialInboxMutationFamilies(): () => void {
  const unregister = [
    ...TRANSACTION_FAMILIES.map(def => registerGodModeMutationFamily({
      family: `social-inbox-${def.kind}`,
      method: def.method,
      matchesPath: def.matches,
      prepare: async event => await prepareGodModeTransactionMutation(event, operationFor(event, def), {
        transaction,
        appendAudit: appendGodModeAuditEvent,
        digestRequest: async request => await digest(request, def)
      })
    })),
    ...EXTERNAL_FAMILIES.map(def => registerGodModeMutationFamily({
      family: `social-inbox-${def.kind}`,
      method: def.method,
      matchesPath: def.matches,
      prepare: event => prepareGodModeExternalMutation(event, def.mutation, defaultExternalLedgerDependencies)
    }))
  ]
  return () => {
    for (const fn of unregister.reverse()) fn()
  }
}
