/**
 * God-mode mutation families for Search Authority.
 *
 * Owners run every non-GET /api route under the execution ledger; a write route without a
 * registered family is refused with 503 "God mode mutation coordination required". Until this
 * module existed every Search Authority write (approve, publish, menu config, site setup, …)
 * failed for owners only, so the feature could not be operated end-to-end by an owner.
 *
 * Two boundaries are used, mirroring `qr/godModeMutations.ts` and `audio/godModeExternalMutations.ts`:
 *
 * - **Transaction families** — DB-only writes. The route hands its work to
 *   `executeSearchAuthorityMutation`, which runs it inside the coordinated transaction for owners
 *   and a plain transaction for everyone else. The result must carry an `id` (the replay reference).
 * - **External families** — writes that also touch a provider (R2 manifest activation, Google
 *   Search Console, PageSpeed, background sync). These use the execution-ledger protocol via
 *   `executeSearchAuthorityExternalMutation`; the route calls `run.markDispatched()` once the
 *   provider has accepted the work and returns a small JSON result that is stored for replay.
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
const BASE = '/api/agency/search-authority'
const route = (suffix: string) => new RegExp(`^${BASE}${suffix}$`, 'i')

// ---------------------------------------------------------------------------
// Transaction-bound families (DB only)
// ---------------------------------------------------------------------------

export type SearchAuthorityMutationKind
  = 'asset-create' | 'version-create' | 'version-submit' | 'version-approve' | 'version-reject'
    | 'menu-config' | 'site-configure' | 'opportunity-transition' | 'google-disconnect'

interface FamilyDef {
  kind: SearchAuthorityMutationKind
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  matches: (path: string) => boolean
  name: string
}

const CONTENT = `${BASE}/content`
const TRANSACTION_FAMILIES: FamilyDef[] = [
  { kind: 'asset-create', method: 'POST', matches: p => p === CONTENT, name: 'Search Authority guide creation' },
  { kind: 'version-create', method: 'POST', matches: p => route(`/content/${UUID}/versions`).test(p), name: 'Search Authority version creation' },
  { kind: 'version-submit', method: 'POST', matches: p => route(`/content/${UUID}/submit`).test(p), name: 'Search Authority review submission' },
  { kind: 'version-approve', method: 'POST', matches: p => route(`/content/${UUID}/approve`).test(p), name: 'Search Authority approval' },
  { kind: 'version-reject', method: 'POST', matches: p => route(`/content/${UUID}/reject`).test(p), name: 'Search Authority rejection' },
  { kind: 'menu-config', method: 'PUT', matches: p => p === `${BASE}/menu/config`, name: 'Search Authority menu configuration' },
  { kind: 'site-configure', method: 'POST', matches: p => p === `${BASE}/sites`, name: 'Search Authority site configuration' },
  { kind: 'opportunity-transition', method: 'PATCH', matches: p => route(`/opportunities/${UUID}`).test(p), name: 'Search Authority opportunity transition' },
  { kind: 'google-disconnect', method: 'DELETE', matches: p => p === `${BASE}/google/disconnect`, name: 'Search Console disconnection' }
]

const operationsKey = Symbol('searchAuthorityGodModeOperations')
type Operations = Partial<Record<SearchAuthorityMutationKind, GodModeTransactionOperation>>

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
  // DELETE routes carry their identity in the query string, not a body.
  if (def.method === 'DELETE') {
    const url = getRequestURL(event)
    return await sha256Hex(`${url.pathname}${url.search}`)
  }
  return await digestMcpRequestBody(await readBody(event))
}

/**
 * Run a Search Authority DB write inside the right transaction boundary. `mutate` must use
 * `db.query` (pg-style `{ rows }`) and return an object with an `id` — the ledger's replay
 * reference. `replay` rebuilds the same response from that id when an owner retries with the
 * same Idempotency-Key.
 */
export async function executeSearchAuthorityMutation<T extends { id: string }>(
  event: H3Event,
  kind: SearchAuthorityMutationKind,
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

// ---------------------------------------------------------------------------
// External-provider families (R2 / Google / PageSpeed / background sync)
// ---------------------------------------------------------------------------

export type SearchAuthorityExternalKind
  = 'publish' | 'rollback' | 'sync' | 'trust-refresh' | 'google-map'
    | 'opportunity-task-link' | 'finding-task-link'

interface ExternalDef {
  kind: SearchAuthorityExternalKind
  method: 'POST'
  matches: (path: string) => boolean
  mutation: GodModeExternalMutation
}

const EXTERNAL_FAMILIES: ExternalDef[] = [
  { kind: 'publish', method: 'POST', matches: p => route(`/content/${UUID}/publish`).test(p), mutation: { label: 'Search Authority publication', coordinationKey: Symbol('godModeSearchAuthorityPublish') } },
  { kind: 'rollback', method: 'POST', matches: p => route(`/content/${UUID}/rollback`).test(p), mutation: { label: 'Search Authority rollback', coordinationKey: Symbol('godModeSearchAuthorityRollback') } },
  { kind: 'sync', method: 'POST', matches: p => p === `${BASE}/sync`, mutation: { label: 'Search Console sync', coordinationKey: Symbol('godModeSearchAuthoritySync') } },
  { kind: 'trust-refresh', method: 'POST', matches: p => p === `${BASE}/trust/refresh`, mutation: { label: 'Search Authority trust refresh', coordinationKey: Symbol('godModeSearchAuthorityTrustRefresh') } },
  { kind: 'google-map', method: 'POST', matches: p => p === `${BASE}/google/map`, mutation: { label: 'Search Console property mapping', coordinationKey: Symbol('godModeSearchAuthorityGoogleMap') } },
  { kind: 'opportunity-task-link', method: 'POST', matches: p => route(`/opportunities/${UUID}/task-link`).test(p), mutation: { label: 'Search Authority opportunity task link', coordinationKey: Symbol('godModeSearchAuthorityOpportunityTaskLink') } },
  { kind: 'finding-task-link', method: 'POST', matches: p => route(`/trust/findings/${UUID}/task-link`).test(p), mutation: { label: 'Search Authority finding task link', coordinationKey: Symbol('godModeSearchAuthorityFindingTaskLink') } }
]

const externalByKind = new Map(EXTERNAL_FAMILIES.map(def => [def.kind, def] as const))

/**
 * Run a Search Authority write that hands work to an external provider under God mode
 * coordination. `work` receives reserved ids (use `run.ids[0]` for the durable row it creates),
 * must call `run.markDispatched()` once the provider accepted the work, and returns a small
 * JSON-serialisable result. On an owner replay `run.replay` is true and `run.replayResult` holds
 * the stored result — return it instead of repeating the side effect.
 */
export function executeSearchAuthorityExternalMutation<T>(
  event: H3Event,
  kind: SearchAuthorityExternalKind,
  work: (run: GodModeExternalRun<T>) => Promise<T>
): Promise<T> {
  const def = externalByKind.get(kind)
  if (!def) throw createError({ statusCode: 503, statusMessage: 'God mode mutation coordination unavailable' })
  return executeGodModeExternalMutation(event, def.mutation, 1, work)
}

// ---------------------------------------------------------------------------
// Path matchers (exported for tests)
// ---------------------------------------------------------------------------

export function matchesSearchAuthorityTransactionFamily(method: string, path: string): SearchAuthorityMutationKind | null {
  const upper = method.toUpperCase()
  return TRANSACTION_FAMILIES.find(def => def.method === upper && def.matches(path))?.kind ?? null
}

export function matchesSearchAuthorityExternalFamily(method: string, path: string): SearchAuthorityExternalKind | null {
  const upper = method.toUpperCase()
  return EXTERNAL_FAMILIES.find(def => def.method === upper && def.matches(path))?.kind ?? null
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerGodModeSearchAuthorityMutationFamilies(): () => void {
  const unregister = [
    ...TRANSACTION_FAMILIES.map(def => registerGodModeMutationFamily({
      family: `search-authority-${def.kind}`,
      method: def.method,
      matchesPath: def.matches,
      prepare: async event => await prepareGodModeTransactionMutation(event, operationFor(event, def), {
        transaction,
        appendAudit: appendGodModeAuditEvent,
        digestRequest: async request => await digest(request, def)
      })
    })),
    ...EXTERNAL_FAMILIES.map(def => registerGodModeMutationFamily({
      family: `search-authority-${def.kind}`,
      method: def.method,
      matchesPath: def.matches,
      prepare: event => prepareGodModeExternalMutation(event, def.mutation, defaultExternalLedgerDependencies)
    }))
  ]
  return () => {
    for (const fn of unregister.reverse()) fn()
  }
}
